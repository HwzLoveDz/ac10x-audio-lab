#include "codec_default.h"
#include "codec_default_profile.h"

static bool patch(const codec_default_io_t *io, uint8_t address, uint8_t mask, uint8_t value)
{
    uint8_t before, actual;
    if (!io->read(io->context, address, &before)) return false;
    const uint8_t wanted = (uint8_t)((before & (uint8_t)~mask) | (value & mask));
    if (before != wanted && !io->write(io->context, address, wanted)) return false;
    return io->read(io->context, address, &actual) && ((actual ^ wanted) & mask) == 0;
}

static bool selected_patch(const codec_default_io_t *io, uint8_t address, bool differential)
{
    for (size_t i = 0; i < CODEC_DEFAULT_PATCH_COUNT; ++i) {
        const codec_default_patch_t *p = &codec_default_patches[i];
        if (p->address == address) return patch(io, address, p->mask,
            differential ? p->differential : p->single);
    }
    return false;
}

bool codec_default_initialize(const codec_default_io_t *io)
{
    uint8_t id, output;
    if (!io || !io->read || !io->write || !io->delay_ms) return false;
    bool identified = false;
    for (unsigned attempt = 0; attempt < 5; ++attempt) {
        io->delay_ms(io->context, 20);
        if (io->read(io->context, 0, &id)) {
            if (id != 0x12) return false;
            identified = true;
            break;
        }
    }
    if (!identified) return false;
    if (!io->read(io->context, 38, &output)) goto failed;
    const bool differential = (output & 0x10) != 0;
    if (!patch(io, 28, 255, 0) || !patch(io, 38, 0x20, 0) || !patch(io, 7, 1, 0) ||
        !patch(io, 79, 1, 0) || !patch(io, 49, 0x18, 0)) goto failed;
    for (size_t i = 0; i < CODEC_DEFAULT_PATCH_COUNT; ++i) {
        const codec_default_patch_t *p = &codec_default_patches[i];
        if (p->address == 7 || p->address == 28 || p->address == 38 || p->address == 49 || p->address == 79) continue;
        if (!patch(io, p->address, p->mask, differential ? p->differential : p->single)) goto failed;
    }
    if (!selected_patch(io, 49, differential) || !selected_patch(io, 79, differential) ||
        !selected_patch(io, 7, differential)) goto failed;
    io->delay_ms(io->context, 30);
    if (!selected_patch(io, 38, differential)) goto failed;
    io->delay_ms(io->context, 30);
    /* A 2dB/2ms gain ramp follows muted analog/clock settling. No startup sound. */
    uint8_t target = 0;
    for (size_t i = 0; i < CODEC_DEFAULT_PATCH_COUNT; ++i)
        if (codec_default_patches[i].address == 28) target = codec_default_patches[i].single;
    for (unsigned value = 1; value < target; value += 4) {
        if (!patch(io, 28, 255, (uint8_t)value)) goto failed;
        io->delay_ms(io->context, 2);
    }
    if (!patch(io, 28, 255, target)) goto failed;
    // Verify the complete owned profile, including earlier clock and EQ bytes.
    for (size_t i = 0; i < CODEC_DEFAULT_PATCH_COUNT; ++i) {
        const codec_default_patch_t *p = &codec_default_patches[i];
        uint8_t actual;
        const uint8_t wanted = differential ? p->differential : p->single;
        if (!io->read(io->context, p->address, &actual) || ((actual ^ wanted) & p->mask)) goto failed;
    }
    return true;
failed:
    /* Bounded best-effort silence; no reset, flash or calibration registers. */
    (void)io->write(io->context, 28, 0);
    if (io->read(io->context, 38, &output))
        (void)io->write(io->context, 38, (uint8_t)(output & (uint8_t)~0x20));
    return false;
}
