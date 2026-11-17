#pragma once
#include <stdbool.h>
#include <stdint.h>
#include <stdatomic.h>
#include "esp_err.h"
typedef struct {
    _Atomic uint32_t marker_frames, other_frames;
    _Atomic uint32_t i2s_tx_dma_frames, i2s_rx_dma_frames, i2s_tx_q_overflow, i2s_rx_q_overflow, capture_preroll_frames;
    _Atomic uint32_t tx_frames, rx_frames, playback_underflow, capture_drop;
    _Atomic uint32_t i2s_errors, hid_busy, i2c_errors, hid_requests;
    _Atomic uint32_t usb_out_packets, usb_out_bytes, usb_in_packets, usb_in_bytes;
    _Atomic uint32_t usb_steps, capture_queued, capture_pumped, capture_fifo_bytes, capture_queue_blocks;
} bridge_stats_t;
extern bridge_stats_t g_stats;
extern _Atomic bool g_playback_active, g_capture_active;
extern _Atomic bool g_usb_suspended;
esp_err_t audio_bridge_init(void);
esp_err_t audio_bridge_gate(bool enable);
bool audio_bridge_enabled(void);
esp_err_t hid_bridge_init(void);
esp_err_t codec_default_bootstrap(void); // Boot-only, before exposing USB/HID.
void hid_bridge_poll(void); // USB task is the sole owner of HID endpoint writes.
void hid_bridge_disconnect(void);
void usb_descriptors_init(void);
