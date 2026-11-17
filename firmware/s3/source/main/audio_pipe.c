#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "tusb.h"
#include "bridge.h"
#include "audio_pipe.h"

typedef struct {
    uint32_t epoch;
    uint16_t bytes;
    uint8_t samples[AUDIO_BLOCK_BYTES];
} audio_block_t;
static QueueHandle_t playback, capture;
enum { QUEUE_BLOCKS = 4 };
static _Atomic uint32_t epoch;
static _Atomic bool needs_prime;
static uint32_t synced_epoch = UINT32_MAX;
static bool primed; // USB owner only.
_Static_assert(ATOMIC_INT_LOCK_FREE == 2, "USB event ISR requires lock-free epoch");

esp_err_t audio_pipe_init(void)
{
    playback = xQueueCreate(QUEUE_BLOCKS, sizeof(audio_block_t));
    capture = xQueueCreate(QUEUE_BLOCKS, sizeof(audio_block_t));
    return playback && capture ? ESP_OK : ESP_ERR_NO_MEM;
}
uint32_t audio_pipe_epoch(void) { return atomic_load(&epoch); }
void audio_pipe_invalidate(void) { atomic_fetch_add(&epoch, 1); }
static bool playback_ready(void)
{ return audio_bridge_enabled() && g_playback_active && !g_usb_suspended; }
static bool capture_ready(void)
{ return audio_bridge_enabled() && g_capture_active && !g_usb_suspended; }

// I2S workers exchange copied blocks only: they never access a TinyUSB FIFO.
bool audio_pipe_playback(void *samples, uint32_t *token)
{
    audio_block_t block;
    if (!playback_ready()) return false;
    for (unsigned i = 0; i < QUEUE_BLOCKS && xQueueReceive(playback, &block, 0) == pdTRUE; ++i) {
        if (block.epoch != audio_pipe_epoch() || !playback_ready()) continue;
        memcpy(samples, block.samples, AUDIO_BLOCK_BYTES);
        *token = block.epoch;
        return true;
    }
    needs_prime = true;
    ++g_stats.playback_underflow;
    return false;
}
bool audio_pipe_capture(const void *samples, size_t bytes, uint32_t token)
{
    if (!bytes || bytes > AUDIO_BLOCK_BYTES || bytes % 4 ||
        token != audio_pipe_epoch() || !capture_ready()) return false;
    audio_block_t block = { .epoch = token, .bytes = (uint16_t)bytes };
    memcpy(block.samples, samples, bytes);
    if (xQueueSend(capture, &block, 0) == pdTRUE) { ++g_stats.capture_queued; return true; }
    g_stats.capture_drop += bytes / 4;
    return false;
}

void audio_pipe_usb_sync(void)
{
    const uint32_t token = audio_pipe_epoch();
    if (token == synced_epoch) return;
    // Called in the pinned USB task's bounded critical section. Stack-internal
    // clears protect the index stores in the local TinyUSB tu_fifo_clear patch.
    tud_audio_clear_ep_out_ff();
    tud_audio_clear_ep_in_ff();
    xQueueReset(playback);
    xQueueReset(capture);
    primed = false;
    needs_prime = false;
    synced_epoch = token;
    if (capture_ready()) {
        // Explicit startup silence fills the four-ms flow-control target;
        // all following samples come from the external I2S codec.
        static const uint8_t preroll[AUDIO_BLOCK_BYTES] = {0};
        for (unsigned i = 0; i < 4; ++i)
            g_stats.capture_preroll_frames += tud_audio_write(preroll, sizeof(preroll)) / 4;
    }
}
void audio_pipe_usb_pump(void)
{
    const uint32_t token = audio_pipe_epoch();
    if (token != synced_epoch) return; // A gate change awaits the next guarded sync.
    if (atomic_exchange(&needs_prime, false)) primed = false;
    if (!playback_ready()) primed = false;
    else {
        if (!primed) primed = tud_audio_available() >= 2 * AUDIO_BLOCK_BYTES;
        for (unsigned i = 0; i < QUEUE_BLOCKS && primed && uxQueueSpacesAvailable(playback) &&
             token == audio_pipe_epoch() && tud_audio_available() >= AUDIO_BLOCK_BYTES; ++i) {
            audio_block_t block = { .epoch = token, .bytes = AUDIO_BLOCK_BYTES };
            if (tud_audio_read(block.samples, AUDIO_BLOCK_BYTES) != AUDIO_BLOCK_BYTES) {
                primed = false;
                break;
            }
            if (xQueueSend(playback, &block, 0) != pdTRUE) break;
        }
    }
    if (!capture_ready()) return;
    g_stats.capture_queue_blocks = uxQueueMessagesWaiting(capture);
    tu_fifo_t *snapshot_fifo = tud_audio_get_ep_in_ff();
    g_stats.capture_fifo_bytes = snapshot_fifo ? tu_fifo_count(snapshot_fifo) : 0;
    audio_block_t block;
    for (unsigned i = 0; i < QUEUE_BLOCKS && xQueuePeek(capture, &block, 0) == pdTRUE; ++i) {
        if (token != audio_pipe_epoch()) break;
        if (block.epoch != token) {
            xQueueReceive(capture, &block, 0);
            continue;
        }
        tu_fifo_t *fifo = tud_audio_get_ep_in_ff();
        if (!fifo || tu_fifo_remaining(fifo) < block.bytes) break;
        xQueueReceive(capture, &block, 0);
        const uint16_t written = tud_audio_write(block.samples, block.bytes);
        ++g_stats.capture_pumped;
        if (written < block.bytes) g_stats.capture_drop += (block.bytes - written) / 4;
    }
}
