#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "tusb.h"
#include "device/dcd.h"
#include "bridge.h"
#include "audio_pipe.h"

static portMUX_TYPE usb_state_guard = portMUX_INITIALIZER_UNLOCKED;
void bridge_usb_task_step(void)
{
    configASSERT(xPortGetCoreID() == BRIDGE_USB_CORE);
    // Endpoint reconfiguration can wait for DWC2 hardware acknowledgements.
    // Keep IRQs enabled while the stack handles those events. The local
    // TinyUSB override protects only the FIFO index-reset stores themselves.
    // Process a bounded nonblocking event batch. The outer owner task blocks
    // for one tick between iterations, allowing lower-priority tasks to run.
    tud_task_ext(0, false);
    ++g_stats.usb_steps;
    portENTER_CRITICAL(&usb_state_guard);
    if (!tud_mounted()) { g_playback_active = false; g_capture_active = false; }
    audio_pipe_usb_sync();
    portEXIT_CRITICAL(&usb_state_guard);
    // Only this task and the USB ISR now touch TinyUSB audio FIFOs. Normal
    // single-producer/single-consumer copies may run with the IRQ enabled.
    audio_pipe_usb_pump();
    hid_bridge_poll();
}

void tud_event_hook_cb(uint8_t rhport, uint32_t eventid, bool in_isr)
{
    (void)rhport; (void)in_isr;
    if (eventid == DCD_EVENT_BUS_RESET || eventid == DCD_EVENT_UNPLUGGED) {
        g_playback_active = false;
        g_capture_active = false;
        audio_pipe_invalidate();
    } else if (eventid == DCD_EVENT_SUSPEND) {
        g_usb_suspended = true;
        audio_pipe_invalidate();
    }
}
