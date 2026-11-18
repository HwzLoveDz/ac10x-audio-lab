#pragma once
#include <stdint.h>
#include <stdbool.h>
#define AEC_FIR_TAPS 127
typedef struct { float history[2][2*AEC_FIR_TAPS]; unsigned pos, phase; } aec_decimator_t;
typedef struct { float history[AEC_FIR_TAPS]; unsigned pos; } aec_interpolator_t;
void aec_resample_reset(aec_decimator_t *, aec_interpolator_t *);
bool aec_decimate(aec_decimator_t *, int16_t reference, int16_t mic, int16_t *ref16, int16_t *mic16);
void aec_interpolate(aec_interpolator_t *, int16_t input, int16_t output[3]);
