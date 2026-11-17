#pragma once
#include <assert.h>
#include <stdint.h>
typedef int BaseType_t;
typedef unsigned UBaseType_t;
typedef unsigned TickType_t;
typedef struct { int unused; } portMUX_TYPE;
#define portMUX_INITIALIZER_UNLOCKED {0}
#define pdTRUE 1
#define pdFALSE 0
#define configASSERT(x) assert(x)
void host_critical_enter(portMUX_TYPE *guard);
void host_critical_exit(portMUX_TYPE *guard);
#define portENTER_CRITICAL(g) host_critical_enter(g)
#define portEXIT_CRITICAL(g) host_critical_exit(g)
