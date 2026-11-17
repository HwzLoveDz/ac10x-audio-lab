#include <stddef.h>
#include <string.h>
void *host_fifo_memcpy(void *dst, const void *src, size_t bytes);
#define memcpy host_fifo_memcpy
