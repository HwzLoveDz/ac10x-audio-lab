#include <string.h>
#include <stdio.h>
#include "esp_mac.h"
#include "tusb.h"
#include "board_pins.h"
#include "bridge.h"
#include "audio_pipe.h"

// UAC2: one read-only 48 kHz clock, independent playback/capture interfaces.
// No advertised volume/mute controls: the raw HID register bridge owns codec settings.
enum { CLOCK_ID = 4, AUDIO_CONTROL = 0, PLAYBACK = 1, CAPTURE = 2, HID = 3 };
#define AC_BYTES (TUD_AUDIO20_DESC_CLK_SRC_LEN + 2*TUD_AUDIO20_DESC_INPUT_TERM_LEN + 2*TUD_AUDIO20_DESC_OUTPUT_TERM_LEN)
#define AUDIO_BYTES (TUD_AUDIO20_DESC_IAD_LEN + TUD_AUDIO20_DESC_STD_AC_LEN + TUD_AUDIO20_DESC_CS_AC_LEN + AC_BYTES + 4*TUD_AUDIO20_DESC_STD_AS_LEN + 2*(TUD_AUDIO20_DESC_CS_AS_INT_LEN + TUD_AUDIO20_DESC_TYPE_I_FORMAT_LEN + TUD_AUDIO20_DESC_STD_AS_ISO_EP_LEN + TUD_AUDIO20_DESC_CS_AS_ISO_EP_LEN) + TUD_AUDIO20_DESC_STD_AS_ISO_FB_EP_LEN)
#define CONFIG_BYTES (TUD_CONFIG_DESC_LEN + AUDIO_BYTES + TUD_HID_INOUT_DESC_LEN)

static const tusb_desc_device_t device_descriptor = {
    .bLength = sizeof(tusb_desc_device_t), .bDescriptorType = TUSB_DESC_DEVICE,
    .bcdUSB = 0x0200, .bDeviceClass = TUSB_CLASS_MISC,
    .bDeviceSubClass = MISC_SUBCLASS_COMMON, .bDeviceProtocol = MISC_PROTOCOL_IAD,
    .bMaxPacketSize0 = 64, .idVendor = BRIDGE_USB_VID, .idProduct = BRIDGE_USB_PID,
    .bcdDevice = BRIDGE_USB_BCD, .iManufacturer = 1, .iProduct = 2, .iSerialNumber = 3,
    .bNumConfigurations = 1,
};
static const uint8_t hid_report[] = {
    0x06, 0x00, 0xff, 0x09, 0x01, 0xa1, 0x01,
    0x15, 0x00, 0x26, 0xff, 0x00, 0x75, 0x08, 0x95, 0x0a,
    0x09, 0x01, 0x81, 0x02, 0x09, 0x01, 0x91, 0x02, 0xc0,
};
static char serial[20];
void usb_descriptors_init(void)
{
    uint8_t mac[6];
    ESP_ERROR_CHECK(esp_read_mac(mac, ESP_MAC_WIFI_STA));
    snprintf(serial, sizeof(serial), BRIDGE_BOARD_NAME "%02X%02X%02X%02X%02X%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
}

#define AUDIO_DESC(ep_size, audio_interval, hid_interval) \
    TUD_CONFIG_DESCRIPTOR(1, 4, 0, CONFIG_BYTES, TUSB_DESC_CONFIG_ATT_SELF_POWERED, 2), \
    TUD_AUDIO20_DESC_IAD(0, 3, 4), \
    TUD_AUDIO20_DESC_STD_AC(0, 0, 4), \
    TUD_AUDIO20_DESC_CS_AC(0x0200, AUDIO20_FUNC_HEADSET, AC_BYTES, 0), \
    TUD_AUDIO20_DESC_CLK_SRC(4, AUDIO20_CLOCK_SOURCE_ATT_INT_FIX_CLK, 5, 0, 0), \
    TUD_AUDIO20_DESC_INPUT_TERM(1, AUDIO_TERM_TYPE_USB_STREAMING, 0, 4, 2, 3, 0, 0, 0), \
    TUD_AUDIO20_DESC_OUTPUT_TERM(3, AUDIO_TERM_TYPE_OUT_GENERIC_SPEAKER, 0, 1, 4, 0, 0), \
    TUD_AUDIO20_DESC_INPUT_TERM(0x11, AUDIO_TERM_TYPE_IN_GENERIC_MIC, 0, 4, 2, 3, 0, 0, 0), \
    TUD_AUDIO20_DESC_OUTPUT_TERM(0x13, AUDIO_TERM_TYPE_USB_STREAMING, 0, 0x11, 4, 0, 0), \
    TUD_AUDIO20_DESC_STD_AS_INT(1, 0, 0, 5), \
    TUD_AUDIO20_DESC_STD_AS_INT(1, 1, 2, 5), \
    TUD_AUDIO20_DESC_CS_AS_INT(1, 0, AUDIO20_FORMAT_TYPE_I, AUDIO20_DATA_FORMAT_TYPE_I_PCM, 2, 3, 0), \
    TUD_AUDIO20_DESC_TYPE_I_FORMAT(2, 16), \
    TUD_AUDIO20_DESC_STD_AS_ISO_EP(0x01, TUSB_XFER_ISOCHRONOUS | TUSB_ISO_EP_ATT_ASYNCHRONOUS, ep_size, audio_interval), \
    TUD_AUDIO20_DESC_CS_AS_ISO_EP(0, 0, 0, 0), \
    TUD_AUDIO20_DESC_STD_AS_ISO_FB_EP(0x82, 4, audio_interval), \
    TUD_AUDIO20_DESC_STD_AS_INT(2, 0, 0, 6), \
    TUD_AUDIO20_DESC_STD_AS_INT(2, 1, 1, 6), \
    TUD_AUDIO20_DESC_CS_AS_INT(0x13, 0, AUDIO20_FORMAT_TYPE_I, AUDIO20_DATA_FORMAT_TYPE_I_PCM, 2, 3, 0), \
    TUD_AUDIO20_DESC_TYPE_I_FORMAT(2, 16), \
    TUD_AUDIO20_DESC_STD_AS_ISO_EP(0x83, TUSB_XFER_ISOCHRONOUS | TUSB_ISO_EP_ATT_ASYNCHRONOUS, ep_size, audio_interval), \
    TUD_AUDIO20_DESC_CS_AS_ISO_EP(0, 0, 0, 0), \
    TUD_HID_INOUT_DESCRIPTOR(3, 7, HID_ITF_PROTOCOL_NONE, sizeof(hid_report), 0x04, 0x84, 10, hid_interval)

// At Full Speed, each 1 ms packet holds 48 stereo frames plus one-frame margin.
static const uint8_t config_fs[] = { AUDIO_DESC(196, 1, 1) };
_Static_assert(sizeof(config_fs) == CONFIG_BYTES, "descriptor length mismatch");
const uint8_t *tud_descriptor_device_cb(void) { return (const uint8_t *)&device_descriptor; }
#if CONFIG_IDF_TARGET_ESP32S31
// Retain the S31 High Speed descriptors, with 6 frames plus margin per microframe.
static const uint8_t config_hs[] = { AUDIO_DESC(28, 1, 4) };
_Static_assert(sizeof(config_hs) == CONFIG_BYTES, "HS descriptor length mismatch");
static uint8_t other_speed[CONFIG_BYTES];
static const tusb_desc_device_qualifier_t qualifier = {
    .bLength = sizeof(tusb_desc_device_qualifier_t), .bDescriptorType = TUSB_DESC_DEVICE_QUALIFIER,
    .bcdUSB = 0x0200, .bDeviceClass = TUSB_CLASS_MISC, .bDeviceSubClass = MISC_SUBCLASS_COMMON,
    .bDeviceProtocol = MISC_PROTOCOL_IAD, .bMaxPacketSize0 = 64, .bNumConfigurations = 1,
};
const uint8_t *tud_descriptor_device_qualifier_cb(void) { return (const uint8_t *)&qualifier; }
const uint8_t *tud_descriptor_configuration_cb(uint8_t index)
{
    if (index != 0) return NULL;
    return tud_speed_get() == TUSB_SPEED_HIGH ? config_hs : config_fs;
}
const uint8_t *tud_descriptor_other_speed_configuration_cb(uint8_t index)
{
    if (index != 0) return NULL;
    memcpy(other_speed, tud_speed_get() == TUSB_SPEED_HIGH ? config_fs : config_hs, CONFIG_BYTES);
    other_speed[1] = TUSB_DESC_OTHER_SPEED_CONFIG;
    return other_speed;
}
#else
const uint8_t *tud_descriptor_device_qualifier_cb(void) { return NULL; }
const uint8_t *tud_descriptor_configuration_cb(uint8_t index)
{ return index == 0 ? config_fs : NULL; }
const uint8_t *tud_descriptor_other_speed_configuration_cb(uint8_t index)
{ (void)index; return NULL; }
#endif
const uint8_t *tud_hid_descriptor_report_cb(uint8_t instance) { (void)instance; return hid_report; }
const uint16_t *tud_descriptor_string_cb(uint8_t index, uint16_t langid)
{
    (void)langid;
    static uint16_t out[48];
    static const char *const strings[] = { "", "NexaCube Dev", BRIDGE_USB_PRODUCT,
        serial, "AC10x Duplex", "I2S Playback", "I2S Capture", "AC10x Register Bridge" };
    if (index == 0) { out[0] = (TUSB_DESC_STRING << 8) | 4; out[1] = 0x0409; return out; }
    if (index >= sizeof(strings)/sizeof(strings[0])) return NULL;
    size_t n = strlen(strings[index]); if (n > 47) n = 47;
    for (size_t i = 0; i < n; ++i) out[i+1] = (uint8_t)strings[index][i];
    out[0] = (TUSB_DESC_STRING << 8) | (2*n + 2); return out;
}
bool tud_audio_get_req_entity_cb(uint8_t port, const tusb_control_request_t *q)
{
    if ((q->wIndex >> 8) != CLOCK_ID) return false;
    const uint8_t selector = q->wValue >> 8;
    if (selector == AUDIO20_CS_CTRL_SAM_FREQ) {
        if (q->bRequest == AUDIO20_CS_REQ_CUR) {
            const uint32_t freq = BRIDGE_SAMPLE_RATE;
            return tud_audio_buffer_and_schedule_control_xfer(port, q, (void *)&freq, sizeof(freq));
        }
        if (q->bRequest == AUDIO20_CS_REQ_RANGE) {
            const uint8_t range[] = {1,0, 0x80,0xbb,0,0, 0x80,0xbb,0,0, 0,0,0,0};
            return tud_audio_buffer_and_schedule_control_xfer(port, q, (void *)range, sizeof(range));
        }
    }
    if (selector == AUDIO20_CS_CTRL_CLK_VALID && q->bRequest == AUDIO20_CS_REQ_CUR) {
        const uint8_t valid = audio_bridge_enabled() ? 1 : 0;
        return tud_audio_buffer_and_schedule_control_xfer(port, q, (void *)&valid, 1);
    }
    return false;
}
bool tud_audio_set_req_entity_cb(uint8_t port, const tusb_control_request_t *q, uint8_t *data)
{ (void)port; (void)q; (void)data; return false; } // clock is read-only.
bool tud_audio_set_itf_cb(uint8_t port, const tusb_control_request_t *q)
{
    (void)port;
    if ((uint8_t)q->wIndex == PLAYBACK) g_playback_active = (uint8_t)q->wValue == 1;
    if ((uint8_t)q->wIndex == CAPTURE) g_capture_active = (uint8_t)q->wValue == 1;
    audio_pipe_invalidate();
    return true;
}
bool tud_audio_set_itf_close_ep_cb(uint8_t port, const tusb_control_request_t *q)
{
    (void)port;
    if ((uint8_t)q->wIndex == PLAYBACK) g_playback_active = false;
    if ((uint8_t)q->wIndex == CAPTURE) g_capture_active = false;
    audio_pipe_invalidate();
    return true;
}
void tud_audio_feedback_params_cb(uint8_t function, uint8_t alt, audio_feedback_params_t *p)
{
    (void)function; (void)alt;
    // Track the independent I2S consumption rate through the bounded USB FIFO.
    // Initialize the first explicit feedback packet to the nominal rate.
    p->method = AUDIO_FEEDBACK_METHOD_FIFO_COUNT; p->sample_freq = BRIDGE_SAMPLE_RATE;
    p->fifo_count.fifo_threshold = 768; // Back-pressure includes the bounded I2S playback queue.
    const uint32_t divisor = tud_speed_get() == TUSB_SPEED_FULL ? 1000 : 8000;
    (void)tud_audio_n_fb_set(function, (BRIDGE_SAMPLE_RATE / divisor) << 16);
}
void tud_umount_cb(void)
{ g_playback_active = false; g_capture_active = false; audio_pipe_invalidate(); hid_bridge_disconnect(); }
void tud_mount_cb(void)
{ g_playback_active = false; g_capture_active = false; g_usb_suspended = false; audio_pipe_invalidate(); hid_bridge_disconnect(); }
void tud_suspend_cb(bool remote_wakeup_enabled)
{ (void)remote_wakeup_enabled; g_usb_suspended = true; audio_pipe_invalidate(); hid_bridge_disconnect(); }
void tud_resume_cb(void) { g_usb_suspended = false; audio_pipe_invalidate(); }

bool tud_audio_rx_done_isr(uint8_t port, uint16_t bytes, uint8_t function,
                           uint8_t endpoint, uint8_t alt)
{
    (void)port; (void)function; (void)endpoint; (void)alt;
    ++g_stats.usb_out_packets;
    g_stats.usb_out_bytes += bytes;
    return true;
}
bool tud_audio_tx_done_isr(uint8_t port, uint16_t bytes, uint8_t function,
                           uint8_t endpoint, uint8_t alt)
{
    (void)port; (void)function; (void)endpoint; (void)alt;
    ++g_stats.usb_in_packets;
    g_stats.usb_in_bytes += bytes;
    return true;
}
