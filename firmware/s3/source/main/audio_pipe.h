#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "esp_err.h"

#define AUDIO_BLOCK_BYTES 192  // 1 ms, stereo S16LE at 48 kHz.
#define BRIDGE_USB_CORE 0      // TinyUSB task and its allocated IRQ must share a core.
esp_err_t audio_pipe_init(void);
uint32_t audio_pipe_epoch(void);
void audio_pipe_invalidate(void); // Atomic only; also safe from the USB event ISR.
bool audio_pipe_playback(void *samples, uint32_t *epoch);
bool audio_pipe_capture(const void *samples, size_t bytes, uint32_t epoch);
void audio_pipe_usb_sync(void); // USB owner only, with local interrupts masked.
void audio_pipe_usb_pump(void); // USB owner only; normal SPSC access with USB ISR.
void bridge_usb_task_step(void);
