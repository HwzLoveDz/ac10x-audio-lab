#pragma once
#include "FreeRTOS.h"
int xTaskCreatePinnedToCore(void (*)(void*),const char *,unsigned,void *,unsigned,void *,unsigned);

#define uxTaskGetStackHighWaterMark(x) 8192
