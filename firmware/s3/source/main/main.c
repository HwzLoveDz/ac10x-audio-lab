#include <inttypes.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "esp_private/usb_phy.h"
#include "tusb.h"
#include "bridge.h"
#include "board_pins.h"
#include "audio_pipe.h"
#include "aec_service.h"
uint32_t tusb_time_millis_api(void) { return (uint32_t)(esp_timer_get_time()/1000); }
static void usb_task(void *unused)
{
    (void)unused;
    const tusb_rhport_init_t init = {.role=TUSB_ROLE_DEVICE,.speed=TUSB_SPEED_FULL};
    ESP_ERROR_CHECK(tusb_init(0,&init) ? ESP_OK : ESP_FAIL);
    for (;;) { bridge_usb_task_step(); vTaskDelay(pdMS_TO_TICKS(1)); }
}
void app_main(void)
{
    ESP_LOGI("bridge","S3 AEC FIRMWARE v0.3.0; USB soundcard / clear vocals / independent capture");
    ESP_LOGW("bridge","GPIO8-14; default USB soundcard; AEC available through Quick Start");
    ESP_ERROR_CHECK(hid_bridge_init());
    ESP_ERROR_CHECK(audio_pipe_init());
    if(aec_service_init()!=ESP_OK) ESP_LOGW("bridge","AEC unavailable; raw soundcard remains available");
    ESP_ERROR_CHECK(audio_bridge_init());
    // Fixed-rate clocks and zero PCM are running; USB cannot deliver data yet.
    const esp_err_t defaults = codec_default_bootstrap();
    if (defaults == ESP_OK) ESP_LOGI("bridge", "Default USB soundcard / clear-vocal profile verified");
    else ESP_LOGE("bridge", "Default codec profile failed; best-effort silence, HID recovery available");
    usb_descriptors_init();
    static usb_phy_handle_t phy;
    const usb_phy_config_t cfg={.controller=USB_PHY_CTRL_OTG,.target=USB_PHY_TARGET_INT,
        .otg_mode=USB_OTG_MODE_DEVICE,.otg_speed=USB_PHY_SPEED_FULL};
    ESP_ERROR_CHECK(usb_new_phy(&cfg,&phy));
    ESP_ERROR_CHECK(xTaskCreatePinnedToCore(usb_task,"usb-uac-hid",6144,NULL,7,NULL,BRIDGE_USB_CORE)==pdPASS?ESP_OK:ESP_ERR_NO_MEM);
    ESP_LOGI("bridge","48kHz S16LE stereo; 32-bit I2S slots; nominal clocks 12.288M/3.072M/48k");
    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(1000));
        ESP_LOGI("bridge","usb=%d speed=%d play=%d rec=%d gate=%d tx=%"PRIu32" rx=%"PRIu32
            " tx_dma=%"PRIu32" rx_dma=%"PRIu32" underrun=%"PRIu32" capture_drop=%"PRIu32
            " i2s_err=%"PRIu32" tx_qov=%"PRIu32" rx_qov=%"PRIu32" preroll=%"PRIu32
            " hid=%"PRIu32" i2c_err=%"PRIu32" out_pkts=%"PRIu32" out_bytes=%"PRIu32" in_pkts=%"PRIu32" in_bytes=%"PRIu32,
            tud_mounted(),tud_speed_get(),g_playback_active,g_capture_active,audio_bridge_enabled(),
            g_stats.tx_frames,g_stats.rx_frames,g_stats.i2s_tx_dma_frames,g_stats.i2s_rx_dma_frames,
            g_stats.playback_underflow,g_stats.capture_drop,g_stats.i2s_errors,g_stats.i2s_tx_q_overflow,
            g_stats.i2s_rx_q_overflow,g_stats.capture_preroll_frames,g_stats.hid_requests,g_stats.i2c_errors,
            g_stats.usb_out_packets,g_stats.usb_out_bytes,g_stats.usb_in_packets,g_stats.usb_in_bytes);
    }
}
