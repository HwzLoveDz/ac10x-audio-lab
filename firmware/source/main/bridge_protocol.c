#include "bridge_protocol.h"
#include <string.h>
bool bridge_register_request(const uint8_t q[10], uint8_t r[10],
                             bridge_transfer_fn transfer, void *ctx)
{
    const uint8_t cmd = q[0] & 0x0f;
    const bool read = cmd == 1;
    memset(r, 0, 10);
    r[0] = q[0]; r[1] = q[1]; r[4] = q[3]; r[5] = q[4]; r[6] = q[7];
    // Original firmware deliberately uses different success/address offsets.
    r[read ? 8 : 7] = q[2];
    if (cmd > 1 || (q[0] & 0xe0) || q[1] != 1 || (q[2] & 1) ||
        (q[2] >> 1) < 0x08 || (q[2] >> 1) > 0x77 ||
        (q[7] != 1 && q[7] != 2) || (!(q[0] & 0x10) && q[3] != 0)) {
        return false;
    }
    uint8_t data[2] = { q[5], q[6] };
    const uint8_t reg[] = { q[3], q[4] };
    const uint8_t reg_len = q[0] & 0x10 ? 2 : 1;
    const bool ok = transfer(ctx, read, q[2] >> 1, reg + 2 - reg_len, reg_len, data, q[7]);
    if (ok) { r[2] = data[0]; if (q[7] == 2) r[3] = data[1]; }
    r[read ? 7 : 8] = ok;
    return ok;
}
