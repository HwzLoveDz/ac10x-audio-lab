#pragma once
#include <stdlib.h>
#define MALLOC_CAP_INTERNAL 1
#define MALLOC_CAP_8BIT 2
size_t heap_caps_get_free_size(unsigned);
void *heap_caps_aligned_alloc(size_t,size_t,unsigned);

#define heap_caps_get_largest_free_block(x) heap_caps_get_free_size(x)

#define MALLOC_CAP_SPIRAM 4
#define MALLOC_CAP_SIMD 8
