#pragma once
#include "sdkconfig.h"
#include "esp_attr.h"
#define CFG_TUSB_OS OPT_OS_FREERTOS
#define CFG_TUSB_DEBUG 0
#define CFG_TUD_ENABLED 1
#if CONFIG_IDF_TARGET_ESP32S31
#define CFG_TUD_MAX_SPEED OPT_MODE_HIGH_SPEED
#else
#define CFG_TUD_MAX_SPEED OPT_MODE_FULL_SPEED
#endif
// Guard the FIFO reset pair while USB task/ISR share one pinned core.
// The vendored stack and host regression use the same reset implementation.
#define CFG_TUD_BRIDGE_FIFO_CLEAR_GUARD 1
// Transport isolation: use the CPU FIFO path instead of internal DMA.
#define CFG_TUD_DWC2_DMA_ENABLE 0
#define CFG_TUD_DWC2_SLAVE_ENABLE 1
// PIO transport with linear packet buffers, not direct SW-FIFO/HW-FIFO sharing.
#define CFG_TUD_EDPT_DEDICATED_HWFIFO 0
// Let the controller carry a missed ISO token to the next microframe.
// Avoid repeated software even/odd-frame retry interrupts on an idle host.
#define CFG_TUD_DWC2_PTI_ENABLE 0
// All ISO data endpoints use bInterval1; allow the next host token after a missed frame.
#define CFG_TUD_DWC2_ISO_IN_RETRY_ENABLE 1
#define CFG_TUSB_MEM_SECTION DRAM_ATTR
#define CFG_TUSB_MEM_ALIGN __attribute__((aligned(4)))
#define CFG_TUD_ENDPOINT0_SIZE 64
#define CFG_TUD_TASK_QUEUE_SZ 64
// Return regularly so queued HID replies are sent while audio events continue.
#define CFG_TUD_TASK_EVENTS_PER_RUN 8
#define CFG_TUD_CDC 0
#define CFG_TUD_MSC 0
#define CFG_TUD_MIDI 0
#define CFG_TUD_VENDOR 0
#define CFG_TUD_HID 1
// Match the 10-byte endpoint/report. A larger OUT request can wait for a
// second full-size packet rather than completing the first HID command.
#define CFG_TUD_HID_EP_BUFSIZE 10
#define CFG_TUD_AUDIO 1
#define CFG_TUD_AUDIO_FUNC_1_N_AS_INT 2
#define CFG_TUD_AUDIO_ENABLE_EP_IN 1
#define CFG_TUD_AUDIO_ENABLE_EP_OUT 1
#define CFG_TUD_AUDIO_ENABLE_FEEDBACK_EP 1
#define CFG_TUD_AUDIO_EP_IN_FLOW_CONTROL 1
// Defer audio work; the event-driven owner wakes directly on USB completion.
#define CFG_TUD_AUDIO_DEFER_IN_XFER 0
#define CFG_TUD_AUDIO_FUNC_1_N_FORMATS 1
#define CFG_TUD_AUDIO_FUNC_1_N_CHANNELS_RX 2
#define CFG_TUD_AUDIO_FUNC_1_N_CHANNELS_TX 2
#define CFG_TUD_AUDIO_FUNC_1_N_BYTES_PER_SAMPLE_RX 2
#define CFG_TUD_AUDIO_FUNC_1_N_BYTES_PER_SAMPLE_TX 2
#define CFG_TUD_AUDIO_FUNC_1_MAX_SAMPLE_RATE 48000
#define CFG_TUD_AUDIO_FUNC_1_EP_OUT_SZ_MAX 196
#define CFG_TUD_AUDIO_FUNC_1_EP_IN_SZ_MAX 196
#define CFG_TUD_AUDIO_FUNC_1_EP_OUT_SW_BUF_SZ 3072
#define CFG_TUD_AUDIO_FUNC_1_EP_IN_SW_BUF_SZ 1536
#define CFG_TUD_AUDIO_CTRL_BUF_SZ 64

#define CFG_TUD_AUDIO_DEFER_ALL_XFER 0
