#pragma once
#include <stdbool.h>
#include <stdint.h>
typedef struct {
    void *context;
    bool (*read)(void *, uint8_t, uint8_t *);
    bool (*write)(void *, uint8_t, uint8_t);
    void (*delay_ms)(void *, unsigned);
} codec_default_io_t;
/* Must run after MCLK is stable and before exposing USB/HID to the host. */
bool codec_default_initialize(const codec_default_io_t *io);
