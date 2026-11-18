#pragma once
#include <stdint.h>
#include <string.h>
#include "esp_err.h"
#define ESP_MAC_WIFI_STA 0
static inline esp_err_t esp_read_mac(uint8_t *mac, int type)
{ (void)type; memset(mac, 0x11, 6); return ESP_OK; }
