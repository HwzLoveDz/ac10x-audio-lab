#pragma once
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
typedef struct { uint32_t epoch; unsigned frame; bool valid; } stream_fade_t;
static inline void stream_fade_apply(stream_fade_t *s, int16_t *pcm, size_t frames,
                                     uint32_t epoch, bool has_audio)
{
    enum { FADE_FRAMES = 240 }; /* 5ms at 48kHz, shared gain for both channels. */
    if (!has_audio) { s->valid = false; s->frame = 0; return; }
    if (!s->valid || s->epoch != epoch) { s->epoch = epoch; s->frame = 0; s->valid = true; }
    for (size_t f = 0; f < frames && s->frame < FADE_FRAMES; ++f, ++s->frame) {
        pcm[f * 2] = (int16_t)((int32_t)pcm[f * 2] * (int32_t)s->frame / FADE_FRAMES);
        pcm[f * 2 + 1] = (int16_t)((int32_t)pcm[f * 2 + 1] * (int32_t)s->frame / FADE_FRAMES);
    }
}
