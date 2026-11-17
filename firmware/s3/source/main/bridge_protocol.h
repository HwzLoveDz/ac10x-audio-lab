#pragma once
#include <stdbool.h>
#include <stdint.h>
#define BRIDGE_REPORT_SIZE 10
typedef bool (*bridge_transfer_fn)(void *ctx, bool read, uint8_t address7,
    const uint8_t *reg, uint8_t reg_len, uint8_t *data, uint8_t data_len);
// Only commands 0/1. Transport-independent to allow host-side protocol tests.
bool bridge_register_request(const uint8_t request[10], uint8_t response[10],
    bridge_transfer_fn transfer, void *ctx);
