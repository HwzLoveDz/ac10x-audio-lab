#pragma once
#include "esp_err.h"
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
esp_err_t aec_service_init(void);
esp_err_t aec_service_set(bool enabled);
bool aec_service_enabled(void);
void aec_service_status(uint8_t response[10]);
void aec_service_capture(int16_t *stereo, size_t bytes, uint32_t epoch);

void aec_trace(uint8_t stage);
void aec_diag(uint8_t report[10]);
