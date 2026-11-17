#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "driver/i2s_std.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "esp_attr.h"
#include "esp_check.h"
#include "board_pins.h"
#include "bridge.h"
#include "audio_pipe.h"
#include "stream_fade.h"
#include "aec_service.h"
static i2s_chan_handle_t tx, rx;
static SemaphoreHandle_t tx_lock, rx_lock;
static _Atomic bool enabled;
static _Atomic bool gate_change_pending;
_Atomic bool g_playback_active, g_capture_active;
_Atomic bool g_usb_suspended;
bridge_stats_t g_stats;
static const i2s_std_gpio_config_t audio_pins = {
    .mclk = BRIDGE_MCLK_GPIO, .bclk = BRIDGE_BCLK_GPIO, .ws = BRIDGE_LRCK_GPIO,
    .dout = BRIDGE_DOUT_GPIO, .din = BRIDGE_DIN_GPIO,
};

bool audio_bridge_enabled(void) { return enabled; }
esp_err_t audio_bridge_gate(bool on)
{
    // A continuous, higher-priority DMA worker can otherwise reacquire its
    // mutex ahead of the HID control task after every one-ms transfer.
    if (atomic_exchange(&gate_change_pending, true)) return ESP_ERR_INVALID_STATE;
    if (!tx_lock || xSemaphoreTake(tx_lock, pdMS_TO_TICKS(100)) != pdTRUE) {
        gate_change_pending = false; return ESP_ERR_TIMEOUT;
    }
    if (xSemaphoreTake(rx_lock, pdMS_TO_TICKS(100)) != pdTRUE) {
        xSemaphoreGive(tx_lock); gate_change_pending = false; return ESP_ERR_TIMEOUT;
    }
    esp_err_t err = ESP_OK;
    if (enabled != on) {
        audio_pipe_invalidate();
        if (on) {
            err = i2s_channel_reconfig_std_gpio(rx, &audio_pins);
            if (err == ESP_OK) err = i2s_channel_reconfig_std_gpio(tx, &audio_pins);
            if (err == ESP_OK) err = i2s_channel_enable(rx);
            if (err == ESP_OK) {
                err = i2s_channel_enable(tx);
                if (err != ESP_OK) i2s_channel_disable(rx);
            }
            enabled = err == ESP_OK;
        } else {
            enabled = false;
            esp_err_t a = i2s_channel_disable(tx);
            esp_err_t b = i2s_channel_disable(rx);
            err = a == ESP_OK ? b : a;
            // Driver disable alone may leave MCLK running. Explicitly detach outputs.
            const int outputs[] = { BRIDGE_MCLK_GPIO, BRIDGE_BCLK_GPIO, BRIDGE_LRCK_GPIO, BRIDGE_DOUT_GPIO };
            for (unsigned i = 0; i < sizeof(outputs)/sizeof(outputs[0]); ++i) {
                gpio_reset_pin(outputs[i]);
                gpio_set_level(outputs[i], 0);
                gpio_set_direction(outputs[i], GPIO_MODE_OUTPUT);
            }
        }
    }
    xSemaphoreGive(rx_lock);
    xSemaphoreGive(tx_lock);
    gate_change_pending = false;
    return err;
}

static bool IRAM_ATTR tx_done(i2s_chan_handle_t handle, i2s_event_data_t *event, void *ctx)
{ (void)handle; (void)ctx; g_stats.i2s_tx_dma_frames += event->size / BRIDGE_FRAME_BYTES; return false; }
static bool IRAM_ATTR rx_done(i2s_chan_handle_t handle, i2s_event_data_t *event, void *ctx)
{ (void)handle; (void)ctx; g_stats.i2s_rx_dma_frames += event->size / BRIDGE_FRAME_BYTES; return false; }
static bool IRAM_ATTR tx_overflow(i2s_chan_handle_t handle, i2s_event_data_t *event, void *ctx)
{ (void)handle; (void)event; (void)ctx; ++g_stats.i2s_tx_q_overflow; return false; }
static bool IRAM_ATTR rx_overflow(i2s_chan_handle_t handle, i2s_event_data_t *event, void *ctx)
{ (void)handle; (void)event; (void)ctx; ++g_stats.i2s_rx_q_overflow; return false; }

static void playback_task(void *unused)
{
    (void)unused;
    int16_t samples[48 * 2];
    stream_fade_t fade = {0};
    for (;;) {
        if (!enabled || gate_change_pending) { vTaskDelay(pdMS_TO_TICKS(2)); continue; }
        memset(samples, 0, sizeof(samples));
        uint32_t token = audio_pipe_epoch();
        const bool received = audio_pipe_playback(samples, &token);
        if (xSemaphoreTake(tx_lock, pdMS_TO_TICKS(10)) == pdTRUE) {
            if (enabled && !gate_change_pending) {
                if (token != audio_pipe_epoch() || !g_playback_active || g_usb_suspended)
                    memset(samples, 0, sizeof(samples));
                stream_fade_apply(&fade, samples, 48, token,
                    received && token == audio_pipe_epoch() && g_playback_active && !g_usb_suspended);
                size_t written = 0;
                esp_err_t err = i2s_channel_write(tx, samples, sizeof(samples), &written, 10);
                g_stats.tx_frames += written / BRIDGE_FRAME_BYTES;
                if (err != ESP_OK || written != sizeof(samples)) ++g_stats.i2s_errors;
            }
            xSemaphoreGive(tx_lock);
        }
        // The DMA write itself blocks at the hardware frame rate. An extra
        // 1-ms sleep would halve sustained throughput once the DMA ring fills.
    }
}

static void capture_task(void *unused)
{
    (void)unused;
    int16_t samples[48 * 2];
    for (;;) {
        if (!enabled || gate_change_pending) { vTaskDelay(pdMS_TO_TICKS(2)); continue; }
        size_t n = 0;
        uint32_t token = audio_pipe_epoch();
        esp_err_t err = ESP_OK;
        if (xSemaphoreTake(rx_lock, pdMS_TO_TICKS(10)) == pdTRUE) {
            if (enabled && !gate_change_pending) {
                token = audio_pipe_epoch();
                err = i2s_channel_read(rx, samples, sizeof(samples), &n, 10);
            }
            xSemaphoreGive(rx_lock);
        }
        if (err != ESP_OK || n % BRIDGE_FRAME_BYTES) {
            ++g_stats.i2s_errors;
            vTaskDelay(pdMS_TO_TICKS(1));
            continue;
        }
        g_stats.rx_frames += n / BRIDGE_FRAME_BYTES;
        if (n) { aec_service_capture(samples,n,token); audio_pipe_capture(samples,n,token); }
        else vTaskDelay(pdMS_TO_TICKS(1)); // Avoid spinning only when no DMA data arrived.
    }
}

esp_err_t audio_bridge_init(void)
{
    tx_lock = xSemaphoreCreateMutex(); rx_lock = xSemaphoreCreateMutex();
    if (!tx_lock || !rx_lock) return ESP_ERR_NO_MEM;
    i2s_chan_config_t channel = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
    channel.dma_desc_num = 6;
    channel.dma_frame_num = 48;
    channel.auto_clear = true;
    ESP_RETURN_ON_ERROR(i2s_new_channel(&channel, &tx, &rx), "audio", "channels");
    i2s_std_config_t cfg = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(BRIDGE_SAMPLE_RATE),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO),
        .gpio_cfg = { .mclk = BRIDGE_MCLK_GPIO, .bclk = BRIDGE_BCLK_GPIO,
            .ws = BRIDGE_LRCK_GPIO, .dout = BRIDGE_DOUT_GPIO, .din = BRIDGE_DIN_GPIO },
    };
    cfg.clk_cfg.mclk_multiple = I2S_MCLK_MULTIPLE_256;
    cfg.clk_cfg.clk_src = I2S_CLK_SRC_DEFAULT; // S3 PLL_160M; S3 has no audio APLL.
    cfg.slot_cfg.slot_bit_width = I2S_SLOT_BIT_WIDTH_32BIT;
    cfg.slot_cfg.ws_width = 32;
    // TX/RX share I2S0 and one master clock. Measure actual clocks on the S3 board.
    ESP_RETURN_ON_ERROR(i2s_channel_init_std_mode(tx, &cfg), "audio", "TX master");
    ESP_RETURN_ON_ERROR(i2s_channel_init_std_mode(rx, &cfg), "audio", "RX shared-clock slave");
    const i2s_event_callbacks_t tx_events = {.on_sent = tx_done, .on_send_q_ovf = tx_overflow};
    const i2s_event_callbacks_t rx_events = {.on_recv = rx_done, .on_recv_q_ovf = rx_overflow};
    ESP_RETURN_ON_ERROR(i2s_channel_register_event_callback(tx, &tx_events, NULL), "audio", "TX events");
    ESP_RETURN_ON_ERROR(i2s_channel_register_event_callback(rx, &rx_events, NULL), "audio", "RX events");
    ESP_RETURN_ON_ERROR(audio_bridge_gate(true), "audio", "start");
    // Keep the fixed-rate PCM workers off the USB interrupt/owner core.
    if (xTaskCreatePinnedToCore(playback_task, "i2s-play", 4096, NULL, 5, NULL, 1) != pdPASS ||
        xTaskCreatePinnedToCore(capture_task, "i2s-record", 4096, NULL, 5, NULL, 1) != pdPASS) return ESP_ERR_NO_MEM;
    return ESP_OK;
}
