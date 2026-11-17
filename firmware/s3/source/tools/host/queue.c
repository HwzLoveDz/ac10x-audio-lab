#include <assert.h>
#include <pthread.h>
#include <stdlib.h>
#include <string.h>
#include "freertos/queue.h"
struct host_queue {
    pthread_mutex_t lock;
    unsigned capacity, bytes, head, count;
    unsigned char *data;
};
static QueueHandle_t queues[2];
static unsigned n_queues;
extern void host_before_queue_send(void);
QueueHandle_t xQueueCreate(UBaseType_t count, UBaseType_t bytes)
{
    assert(n_queues < 2);
    QueueHandle_t q = calloc(1, sizeof(*q)); assert(q);
    q->capacity = count; q->bytes = bytes;
    q->data = calloc(count, bytes); assert(q->data);
    assert(pthread_mutex_init(&q->lock, NULL) == 0);
    queues[n_queues++] = q;
    return q;
}
BaseType_t xQueueSend(QueueHandle_t q, const void *item, TickType_t wait)
{
    assert(wait == 0); host_before_queue_send(); pthread_mutex_lock(&q->lock);
    int ok = q->count < q->capacity;
    if (ok) {
        memcpy(q->data + (q->head + q->count) % q->capacity * q->bytes, item, q->bytes);
        ++q->count;
    }
    pthread_mutex_unlock(&q->lock); return ok;
}
static BaseType_t receive(QueueHandle_t q, void *item, TickType_t wait, int pop)
{
    assert(wait == 0); pthread_mutex_lock(&q->lock);
    int ok = q->count != 0;
    if (ok) {
        memcpy(item, q->data + q->head * q->bytes, q->bytes);
        if (pop) { q->head = (q->head + 1) % q->capacity; --q->count; }
    }
    pthread_mutex_unlock(&q->lock); return ok;
}
BaseType_t xQueueReceive(QueueHandle_t q, void *item, TickType_t wait)
{ return receive(q, item, wait, 1); }
BaseType_t xQueuePeek(QueueHandle_t q, void *item, TickType_t wait)
{ return receive(q, item, wait, 0); }
BaseType_t xQueueReset(QueueHandle_t q)
{
    pthread_mutex_lock(&q->lock); q->head = q->count = 0;
    pthread_mutex_unlock(&q->lock); return pdTRUE;
}
UBaseType_t uxQueueSpacesAvailable(QueueHandle_t q)
{
    pthread_mutex_lock(&q->lock); unsigned free = q->capacity - q->count;
    pthread_mutex_unlock(&q->lock); return free;
}
UBaseType_t uxQueueMessagesWaiting(QueueHandle_t q)
{
    pthread_mutex_lock(&q->lock); unsigned count = q->count;
    pthread_mutex_unlock(&q->lock); return count;
}
void host_queues_destroy(void)
{
    for (unsigned i = 0; i < n_queues; ++i) {
        pthread_mutex_destroy(&queues[i]->lock);
        free(queues[i]->data); free(queues[i]);
    }
}
