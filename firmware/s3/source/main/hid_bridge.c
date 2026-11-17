#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "driver/i2c_master.h"
#include "esp_check.h"
#include "tusb.h"
#include "board_pins.h"
#include "bridge.h"
#include "bridge_protocol.h"
#include "codec_default.h"
#include "aec_service.h"

typedef struct { uint8_t data[BRIDGE_REPORT_SIZE]; uint32_t epoch; } report_t;
static _Atomic uint32_t session_epoch;
static QueueHandle_t requests, responses;
static i2c_master_bus_handle_t bus;
static i2c_master_dev_handle_t device;
static uint8_t device_addr;
static uint8_t last_reply[10];

static bool transfer(void *ctx, bool read, uint8_t addr, const uint8_t *reg,
                     uint8_t reg_len, uint8_t *data, uint8_t data_len)
{
    (void)ctx;
    if (device && device_addr != addr) {
        if (i2c_master_bus_rm_device(device) != ESP_OK) return false;
        device = NULL;
    }
    esp_err_t err = ESP_OK;
    if (!device) {
        i2c_device_config_t cfg = { .dev_addr_length = I2C_ADDR_BIT_LEN_7,
            .device_address = addr, .scl_speed_hz = 400000 };
        err = i2c_master_bus_add_device(bus, &cfg, &device);
        if (err == ESP_OK) device_addr = addr;
    }
    if (err == ESP_OK) {
        if (read) err = i2c_master_transmit_receive(device, reg, reg_len, data, data_len, 20);
        else {
            uint8_t payload[4];
            memcpy(payload, reg, reg_len); memcpy(payload + reg_len, data, data_len);
            err = i2c_master_transmit(device, payload, reg_len + data_len, 20);
        }
    }
    if (err != ESP_OK) ++g_stats.i2c_errors;
    return err == ESP_OK;
}

static bool boot_read(void *ctx, uint8_t reg, uint8_t *value)
{ (void)ctx; return transfer(NULL, true, 0x33, &reg, 1, value, 1); }
static bool boot_write(void *ctx, uint8_t reg, uint8_t value)
{ (void)ctx; return transfer(NULL, false, 0x33, &reg, 1, &value, 1); }
static void boot_delay(void *ctx, unsigned ms)
{ (void)ctx; TickType_t ticks = pdMS_TO_TICKS(ms); vTaskDelay(ticks ? ticks : 1); }
esp_err_t codec_default_bootstrap(void)
{
    // USB is not exposed yet: the HID worker cannot race this use of the bus.
    const codec_default_io_t io = { .context=NULL, .read=boot_read,
        .write=boot_write, .delay_ms=boot_delay };
    return codec_default_initialize(&io) ? ESP_OK : ESP_FAIL;
}

static void hid_worker(void *unused)
{
    (void)unused;
    report_t q, r;
    for (;;) {
        if (xQueueReceive(requests, &q, portMAX_DELAY) != pdTRUE) continue;
        if (q.epoch != session_epoch) continue;
        ++g_stats.hid_requests;
        memset(&r, 0, sizeof(r)); r.data[0] = q.data[0];
        r.epoch = q.epoch;
        if ((q.data[0] & 0x0f) <= 1 && q.data[0] != 0x7e) {
            if ((q.data[0]&15)==0) aec_service_set(false);
            bridge_register_request(q.data, r.data, transfer, NULL);
        } else if (q.data[0] == 2) {
            r.data[1] = 1; r.data[2] = q.data[2];
            r.data[8] = q.data[2] <= 1 && audio_bridge_gate(q.data[2] != 0) == ESP_OK;
        } else if (q.data[0] == 0x7b) {
            aec_diag(r.data);
        } else if (q.data[0] == 0x7d) {
            aec_service_status(r.data);
        } else if (q.data[0] == 0x7c) {
            if(q.data[2]) aec_trace(10);
            bool ok=q.data[1]==1&&q.data[2]<=1;
            if(ok&&q.data[2]) {
                aec_trace(11);
                uint8_t mix=0,dac=0,pattern=0;
                ok=boot_read(NULL,0x13,&mix)&&mix==0x06&&
                   boot_read(NULL,0x1d,&dac)&&(dac&3)==1&&
                   boot_read(NULL,0x19,&pattern)&&(pattern&0x30)==0;
            }
            if(q.data[2]) aec_trace(15);
            if(ok) ok=aec_service_set(q.data[2]!=0)==ESP_OK;
            aec_service_status(r.data); r.data[8]=ok;
        } else if (q.data[0] == 0x7e) {
            // Local extension, status only. No I2C/flash writes.
            r.data[1] = 1; r.data[2] = 0; r.data[3] = 1;
            r.data[4] = audio_bridge_enabled();
            r.data[5] = g_playback_active; r.data[6] = g_capture_active;
            r.data[7] = (uint8_t)g_stats.i2c_errors;
            r.data[8] = 1; r.data[9] = (uint8_t)g_stats.hid_busy;
        }
        // Command 3 and all unknown commands receive a failure response, never erase/reboot.
        // Bounded wait: a missing/unplugged host must never block the audio tasks.
        if (r.epoch == session_epoch && xQueueSend(responses, &r, pdMS_TO_TICKS(50)) != pdTRUE) ++g_stats.hid_busy;
    }
}

esp_err_t hid_bridge_init(void)
{
    requests = xQueueCreate(8, sizeof(report_t));
    responses = xQueueCreate(8, sizeof(report_t));
    if (!requests || !responses) return ESP_ERR_NO_MEM;
    const i2c_master_bus_config_t cfg = { .i2c_port = 0,
        .sda_io_num = BRIDGE_SDA_GPIO, .scl_io_num = BRIDGE_SCL_GPIO,
        .clk_source = I2C_CLK_SRC_DEFAULT, .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true };
    ESP_RETURN_ON_ERROR(i2c_new_master_bus(&cfg, &bus), "bridge", "I2C bus");
    if (xTaskCreate(hid_worker, "hid-i2c", 8192, NULL, 4, NULL) != pdPASS) return ESP_ERR_NO_MEM;
    return ESP_OK;
}

void hid_bridge_poll(void)
{
    report_t r;
    while (xQueuePeek(responses, &r, 0) == pdTRUE && r.epoch != session_epoch) xQueueReceive(responses, &r, 0);
    if (tud_hid_ready() && xQueuePeek(responses, &r, 0) == pdTRUE &&
        tud_hid_report(0, r.data, sizeof(r.data))) {
        xQueueReceive(responses, &r, 0);
        memcpy(last_reply, r.data, sizeof(last_reply));
    }
}

void hid_bridge_disconnect(void)
{
    ++session_epoch;
    memset(last_reply, 0, sizeof(last_reply));
}

uint16_t tud_hid_get_report_cb(uint8_t instance, uint8_t report_id,
    hid_report_type_t type, uint8_t *buffer, uint16_t len)
{
    if (instance || report_id || type != HID_REPORT_TYPE_INPUT) return 0;
    uint16_t n = len < 10 ? len : 10;
    memcpy(buffer, last_reply, n); return n;
}

void tud_hid_set_report_cb(uint8_t instance, uint8_t report_id,
    hid_report_type_t type, const uint8_t *buffer, uint16_t len)
{
    if (instance || report_id || type != HID_REPORT_TYPE_OUTPUT || len != 10) {
        ++g_stats.hid_busy; return;
    }
    report_t q; memcpy(q.data, buffer, 10);
    q.epoch = session_epoch;
    // Never run I2C or acquire audio locks in the TinyUSB task.
    if (xQueueSend(requests, &q, 0) != pdTRUE) ++g_stats.hid_busy;
}
