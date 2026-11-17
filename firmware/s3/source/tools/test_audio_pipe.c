/* Exercises production audio_pipe.c, usb_owner.c and descriptor callbacks.
 * Hardware/FreeRTOS calls are modelled; TinyUSB's actual FIFO is linked.
 * This proves software interleavings, not USB timing or physical audio.
 */
#include <assert.h>
#include <pthread.h>
#include <sched.h>
#include <stdatomic.h>
#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "tusb.h"
#include "device/dcd.h"
#include "bridge.h"
#include "audio_pipe.h"

_Atomic bool g_playback_active, g_capture_active, g_usb_suspended;
bridge_stats_t g_stats;
static _Atomic bool gate = true;
static pthread_t owner;
static int critical_depth, pending_reset, inject_reset;
static int pending_irq, inject_irq_in_task, deferred_irq_count;
static unsigned clears, tusb_calls, worker_iterations;
static _Atomic int hold_send, send_paused, release_send;
static tu_fifo_t out_fifo, in_fifo;
static unsigned char out_storage[3072], in_storage[1536];
void host_before_queue_send(void)
{
    if (atomic_exchange(&hold_send, 0)) {
        send_paused = 1;
        while (!release_send) sched_yield();
    }
}
static void check_owner(void) { assert(pthread_equal(pthread_self(), owner)); ++tusb_calls; }
bool audio_bridge_enabled(void) { return gate; }
int xPortGetCoreID(void) { assert(pthread_equal(pthread_self(), owner)); return BRIDGE_USB_CORE; }
void hid_bridge_poll(void) { check_owner(); assert(!critical_depth); }
void hid_bridge_disconnect(void) { check_owner(); }
bool tud_mounted(void) { check_owner(); return !pending_reset; }
tusb_speed_t tud_speed_get(void) { return TUSB_SPEED_FULL; }
static uint32_t feedback_value;
bool tud_audio_n_fb_set(uint8_t function, uint32_t value)
{ assert(function == 0); feedback_value = value; return true; }
bool tud_audio_buffer_and_schedule_control_xfer(uint8_t port, const tusb_control_request_t *q,
                                              void *data, uint16_t bytes)
{ (void)port; (void)q; (void)data; (void)bytes; return true; }
void host_critical_enter(portMUX_TYPE *guard)
{ (void)guard; check_owner(); assert(critical_depth >= 0); ++critical_depth; }
void host_critical_exit(portMUX_TYPE *guard)
{
    (void)guard; assert(critical_depth > 0); --critical_depth;
    if (pending_irq && critical_depth == 0) {
        pending_irq = 0;
        const unsigned char packet[4] = {1,2,3,4};
        assert(tu_fifo_write_n(&out_fifo, packet, sizeof(packet)) == sizeof(packet));
        ++deferred_irq_count;
    }
}
void tud_task_ext(uint32_t timeout, bool isr)
{
    check_owner(); assert(timeout == 0 && !isr && critical_depth == 0);
    if (pending_reset) {
        // Real stack clears are individually guarded; the whole task is not.
        tu_fifo_clear(&out_fifo); tu_fifo_clear(&in_fifo);
        pending_reset = 0;
    }
    if (inject_irq_in_task) {
        // Model an IRQ arriving at the stack's guarded FIFO clear.
        inject_irq_in_task = 0; pending_irq = 1;
        tu_fifo_clear(&out_fifo);
        assert(critical_depth == 0 && !pending_irq);
    }
}
uint16_t tud_audio_n_available(uint8_t id)
{ (void)id; check_owner(); return tu_fifo_count(&out_fifo); }
uint16_t tud_audio_n_read(uint8_t id, void *data, uint16_t bytes)
{ (void)id; check_owner(); assert(!critical_depth); return tu_fifo_read_n(&out_fifo, data, bytes); }
uint16_t tud_audio_n_write(uint8_t id, const void *data, uint16_t bytes)
{
    (void)id; check_owner();
    // The bounded startup preroll is inserted during guarded sync.
    if (critical_depth) {
        assert(critical_depth == 1 && bytes == AUDIO_BLOCK_BYTES);
        const unsigned char *p = data;
        for (unsigned i = 0; i < bytes; ++i) assert(p[i] == 0);
    }
    return tu_fifo_write_n(&in_fifo, data, bytes);
}
bool tud_audio_n_clear_ep_out_ff(uint8_t id)
{ (void)id; check_owner(); assert(critical_depth == 1); tu_fifo_clear(&out_fifo); ++clears; return true; }
bool tud_audio_n_clear_ep_in_ff(uint8_t id)
{ (void)id; check_owner(); assert(critical_depth == 1); tu_fifo_clear(&in_fifo); ++clears; return true; }
tu_fifo_t *tud_audio_n_get_ep_in_ff(uint8_t id)
{ (void)id; check_owner(); return &in_fifo; }
void *host_fifo_memcpy(void *dst, const void *src, size_t bytes)
{
    void *ret = memcpy(dst, src, bytes);
    if (inject_reset) {
        inject_reset = 0;
        // IRQ hook invalidates packets immediately, but FIFO clear is deferred
        // until the production USB task handles the reset inside its guard.
        tud_event_hook_cb(0, DCD_EVENT_BUS_RESET, true);
        pending_reset = 1;
    }
    return ret;
}
static void activate(void)
{
    gate = true; g_usb_suspended = false;
    g_playback_active = g_capture_active = true;
    audio_pipe_invalidate(); bridge_usb_task_step();
    // Four explicit zero preroll blocks are legitimate new-session data.
    assert(tu_fifo_count(&in_fifo) == 4 * AUDIO_BLOCK_BYTES);
    unsigned char preroll[4 * AUDIO_BLOCK_BYTES];
    assert(tu_fifo_read_n(&in_fifo, preroll, sizeof(preroll)) == sizeof(preroll));
    for (unsigned i = 0; i < sizeof(preroll); ++i) assert(preroll[i] == 0);
}
static void assert_only_preroll(void)
{
    const unsigned count = tu_fifo_count(&in_fifo);
    assert(count == 0 || count == 4 * AUDIO_BLOCK_BYTES);
    unsigned char buffer[4 * AUDIO_BLOCK_BYTES];
    assert(tu_fifo_read_n(&in_fifo, buffer, count) == count);
    for (unsigned i = 0; i < count; ++i) assert(buffer[i] == 0);
}
static void fill_play(unsigned char value)
{
    unsigned char data[384]; memset(data, value, sizeof(data));
    assert(tu_fifo_write_n(&out_fifo, data, sizeof(data)) == sizeof(data));
}
static void *worker(void *arg)
{
    (void)arg;
    unsigned char block[AUDIO_BLOCK_BYTES]; memset(block, 0x57, sizeof(block));
    for (unsigned i = 0; i < 20000; ++i) {
        uint32_t token = audio_pipe_epoch();
        audio_pipe_capture(block, sizeof(block), token);
        audio_pipe_playback(block, &token);
    }
    worker_iterations = 20000;
    return NULL;
}
static void *late_capture(void *arg)
{
    unsigned char samples[AUDIO_BLOCK_BYTES]; memset(samples, 0x77, sizeof(samples));
    assert(audio_pipe_capture(samples, sizeof(samples), *(uint32_t *)arg));
    return NULL;
}
int main(void)
{
    owner = pthread_self();
    assert(tud_descriptor_configuration_cb(0));
    assert(!tud_descriptor_configuration_cb(1));
    assert(!tud_descriptor_device_qualifier_cb());
    assert(!tud_descriptor_other_speed_configuration_cb(0));
    audio_feedback_params_t feedback = {0};
    tud_audio_feedback_params_cb(0, 1, &feedback);
    assert(feedback.method == AUDIO_FEEDBACK_METHOD_FIFO_COUNT);
    assert(feedback.sample_freq == 48000 && feedback_value == (48u << 16));
    puts("PASS FS-only descriptors and 48kHz explicit feedback initialization");
    assert(tu_fifo_config(&out_fifo, out_storage, sizeof(out_storage), true));
    assert(tu_fifo_config(&in_fifo, in_storage, sizeof(in_storage), true));
    assert(audio_pipe_init() == ESP_OK); activate();
    unsigned char block[AUDIO_BLOCK_BYTES]; uint32_t token;
    fill_play(0x31); bridge_usb_task_step();
    assert(audio_pipe_playback(block, &token) && block[0] == 0x31);
    assert(token == audio_pipe_epoch());
    assert(audio_pipe_capture(block, sizeof(block), token)); bridge_usb_task_step();
    assert(tu_fifo_read_n(&in_fifo, block, sizeof(block)) == sizeof(block) && block[0] == 0x31);
    puts("PASS copied playback/capture blocks retain sample contents");

    // Signed, changing full-range PCM must survive capture byte-for-byte.
    // Constant nonzero samples alone would miss sign, channel and gain errors.
    activate();
    for (unsigned round = 0; round < 2000; ++round) {
        int16_t original[48 * 2], returned[48 * 2];
        for (unsigned i = 0; i < 48 * 2; ++i)
            original[i] = (int16_t)((int)((round * 197u + i * 313u) % 65536u) - 32768);
        assert(audio_pipe_capture(original, sizeof(original), audio_pipe_epoch()));
        bridge_usb_task_step();
        assert(tu_fifo_read_n(&in_fifo, returned, sizeof(returned)) == sizeof(returned));
        assert(memcmp(original, returned, sizeof(original)) == 0);
    }
    puts("PASS 2000 full-range signed stereo capture blocks preserve exact raw PCM and channel order");

    // An old read completes across a reset, but cannot enter the new session.
    activate(); fill_play(0x42); inject_reset = 1; bridge_usb_task_step();
    assert(pending_reset && !g_playback_active && !g_capture_active);
    assert(!audio_pipe_playback(block, &token));
    bridge_usb_task_step();
    assert(tu_fifo_count(&out_fifo) == 0); assert_only_preroll();
    puts("PASS former read/clear interleaving: no phantom-full FIFO or stale playback");

    activate(); token = audio_pipe_epoch(); assert(audio_pipe_capture(block, sizeof(block), token));
    gate = false; audio_pipe_invalidate(); gate = true; audio_pipe_invalidate();
    assert(!audio_pipe_capture(block, sizeof(block), token)); bridge_usb_task_step();
    assert_only_preroll();
    puts("PASS rapid off/on ending at the same gate value still invalidates old blocks");

    for (unsigned mode = 0; mode < 8; ++mode) {
        activate(); token = audio_pipe_epoch();
        assert(audio_pipe_capture(block, sizeof(block), token));
        if (mode == 0) tud_umount_cb();
        if (mode == 1) tud_mount_cb();
        if (mode == 2) tud_suspend_cb(false);
        if (mode == 3) tud_resume_cb();
        tusb_control_request_t q = {.wIndex=mode >= 6 ? 2 : 1,.wValue=mode % 2 ? 1 : 0};
        if (mode == 4 || mode == 6) tud_audio_set_itf_close_ep_cb(0, &q);
        if (mode == 5 || mode == 7) tud_audio_set_itf_cb(0, &q);
        assert(audio_pipe_epoch() != token);
        assert(!audio_pipe_capture(block, sizeof(block), token));
        bridge_usb_task_step(); assert_only_preroll();
    }
    puts("PASS real mount/unmount/suspend/resume/alt-setting callbacks reject old generation");

    activate(); token = audio_pipe_epoch();
    hold_send = 1; send_paused = 0; release_send = 0;
    pthread_t late; assert(pthread_create(&late, NULL, late_capture, &token) == 0);
    while (!send_paused) sched_yield();
    audio_pipe_invalidate(); bridge_usb_task_step();
    release_send = 1; assert(pthread_join(late, NULL) == 0);
    bridge_usb_task_step(); assert_only_preroll();
    puts("PASS old capture enqueued after a completed flush is rejected by generation");

    activate(); inject_irq_in_task = 1; bridge_usb_task_step();
    assert(deferred_irq_count == 1 && tu_fifo_count(&out_fifo) == 4);
    puts("PASS stack FIFO clear defers IRQ; endpoint task runs with IRQs enabled");
    audio_pipe_invalidate(); bridge_usb_task_step();
    assert(tu_fifo_count(&out_fifo) == 0); assert_only_preroll();

    activate(); memset(block, 0x63, sizeof(block));
    for (unsigned i = 0; i < 4; ++i) assert(audio_pipe_capture(block, sizeof(block), audio_pipe_epoch()));
    assert(!audio_pipe_capture(block, sizeof(block), audio_pipe_epoch()));
    assert(g_stats.capture_drop > 0);
    puts("PASS bounded capture queue reports overflow without blocking");

    activate(); pthread_t thread; assert(pthread_create(&thread, NULL, worker, NULL) == 0);
    for (unsigned i = 0; i < 3000; ++i) {
        if (i % 11 == 0) audio_pipe_invalidate();
        bridge_usb_task_step();
        tu_fifo_clear(&in_fifo); // Model host draining capture between USB iterations.
        fill_play((unsigned char)i);
    }
    assert(pthread_join(thread, NULL) == 0 && worker_iterations == 20000);
    assert(critical_depth == 0 && !pending_irq);
    printf("PASS SMP worker stress: 20000 iterations, 3000 USB steps; all %u TinyUSB calls owned, %u guarded clears\n", tusb_calls, clears);
    host_queues_destroy();
    puts("PASS audio pipe and USB ownership regression suite");
    return 0;
}
