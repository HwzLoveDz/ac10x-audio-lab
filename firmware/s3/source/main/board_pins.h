#pragma once
#include "sdkconfig.h"
// Provisional generic S3 profile, NOT a verified board wiring diagram.
// USB OTG is fixed at GPIO19 D- / GPIO20 D+. UART0 uses GPIO43/44.
#define BRIDGE_MCLK_GPIO CONFIG_BRIDGE_MCLK_GPIO
#define BRIDGE_BCLK_GPIO CONFIG_BRIDGE_BCLK_GPIO
#define BRIDGE_LRCK_GPIO CONFIG_BRIDGE_LRCK_GPIO
#define BRIDGE_DOUT_GPIO CONFIG_BRIDGE_DOUT_GPIO
#define BRIDGE_DIN_GPIO CONFIG_BRIDGE_DIN_GPIO
#define BRIDGE_SDA_GPIO CONFIG_BRIDGE_SDA_GPIO
#define BRIDGE_SCL_GPIO CONFIG_BRIDGE_SCL_GPIO
#define BRIDGE_SAMPLE_RATE 48000
#define BRIDGE_FRAME_BYTES 4 // USB PCM: 2 channels x signed 16-bit LE
#define BRIDGE_USB_VID 0x303A
#define BRIDGE_USB_PID 0x4005 // Local lab-only identity, NOT production VID/PID rights.
#define BRIDGE_USB_BCD 0x0200 // S3 default firmware 0.2.0; HID protocol remains 0.1.

// Chip-level exclusions: USB, flash/PSRAM, nonexistent, strapping, UART0 pins.
// Board-mounted peripherals still need review before hardware use.
#define BRIDGE_PIN_OK(p) (((p) >= 1 && (p) <= 21 && (p) != 3 && (p) != 19 && (p) != 20) || \
                         ((p) >= 38 && (p) <= 42) || (p) == 47 || (p) == 48)
#define BRIDGE_PIN_ASSERT(p) _Static_assert(BRIDGE_PIN_OK(p), "Unsupported/reserved S3 bridge pin: " #p)
BRIDGE_PIN_ASSERT(BRIDGE_MCLK_GPIO);
BRIDGE_PIN_ASSERT(BRIDGE_BCLK_GPIO);
BRIDGE_PIN_ASSERT(BRIDGE_LRCK_GPIO);
BRIDGE_PIN_ASSERT(BRIDGE_DOUT_GPIO);
BRIDGE_PIN_ASSERT(BRIDGE_DIN_GPIO);
BRIDGE_PIN_ASSERT(BRIDGE_SDA_GPIO);
BRIDGE_PIN_ASSERT(BRIDGE_SCL_GPIO);
#define BRIDGE_PIN_BIT(p) (1ULL << (p))
_Static_assert((BRIDGE_PIN_BIT(BRIDGE_MCLK_GPIO) + BRIDGE_PIN_BIT(BRIDGE_BCLK_GPIO) + \
                BRIDGE_PIN_BIT(BRIDGE_LRCK_GPIO) + BRIDGE_PIN_BIT(BRIDGE_DOUT_GPIO) + \
                BRIDGE_PIN_BIT(BRIDGE_DIN_GPIO) + BRIDGE_PIN_BIT(BRIDGE_SDA_GPIO) + \
                BRIDGE_PIN_BIT(BRIDGE_SCL_GPIO)) == \
               (BRIDGE_PIN_BIT(BRIDGE_MCLK_GPIO) | BRIDGE_PIN_BIT(BRIDGE_BCLK_GPIO) | \
                BRIDGE_PIN_BIT(BRIDGE_LRCK_GPIO) | BRIDGE_PIN_BIT(BRIDGE_DOUT_GPIO) | \
                BRIDGE_PIN_BIT(BRIDGE_DIN_GPIO) | BRIDGE_PIN_BIT(BRIDGE_SDA_GPIO) | \
                BRIDGE_PIN_BIT(BRIDGE_SCL_GPIO)), "Bridge pins must be distinct");
