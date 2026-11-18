#pragma once
#include "sdkconfig.h"
// The S31 Korvo-1 profile uses the unplugged J14 LCD connector.
#define BRIDGE_FW_MAJOR 0
#define BRIDGE_FW_MINOR 4
#define BRIDGE_FW_PATCH 0
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
#if CONFIG_IDF_TARGET_ESP32S31
#define BRIDGE_USB_PID 0x4004
#define BRIDGE_USB_BCD 0x0302
#define BRIDGE_USB_PHY USB_PHY_TARGET_UTMI
#define BRIDGE_BOARD_NAME "S31"
#define BRIDGE_USB_PRODUCT "AC10x S31 Audio Bridge (DEV)"
// Exclude onboard PA control, boot straps and every pin off the existing harness.
#define BRIDGE_PIN_OK(p) ((p) >= 8 && (p) <= 14)
#elif CONFIG_IDF_TARGET_ESP32S3
#define BRIDGE_USB_PID 0x4005
#define BRIDGE_USB_BCD 0x0200
#define BRIDGE_USB_PHY USB_PHY_TARGET_INT
#define BRIDGE_BOARD_NAME "S3"
#define BRIDGE_USB_PRODUCT "AC10x S3 Duplex"
// Chip-level exclusions: USB, flash/PSRAM, nonexistent, strapping, UART0 pins.
// Board-mounted peripherals still need review before hardware use.
#define BRIDGE_PIN_OK(p) (((p) >= 1 && (p) <= 21 && (p) != 3 && (p) != 19 && (p) != 20) || \
                         ((p) >= 38 && (p) <= 42) || (p) == 47 || (p) == 48)
#else
#error "Select an ESP32-S3 or ESP32-S31 build target"
#endif
#define BRIDGE_PIN_ASSERT(p) _Static_assert(BRIDGE_PIN_OK(p), "Unsupported/reserved bridge pin: " #p)
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
