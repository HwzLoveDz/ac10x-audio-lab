// Production resampler/service, deterministic scheduler and fake AEC engine.
// This proves lifecycle/data plumbing, not the vendor algorithm's acoustic performance.
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "../main/aec_service.c"
struct Queue { unsigned count,head,capacity,bytes; unsigned char *data; };
static bool oom; static int creates,destroys,processes;
_Atomic bool g_playback_active,g_capture_active,g_usb_suspended;
static uint32_t host_epoch;
void audio_pipe_invalidate(void) { ++host_epoch; }
uint32_t audio_pipe_epoch(void) { return host_epoch; }
#define test_capture(p,n,e) (host_epoch=(e),aec_service_capture(p,n,e))
QueueHandle_t xQueueCreate(unsigned capacity,unsigned bytes){QueueHandle_t q=calloc(1,sizeof(*q));q->capacity=capacity;q->bytes=bytes;q->data=calloc(capacity,bytes);return q;}
int xQueueSend(QueueHandle_t q,const void *p,TickType_t wait){(void)wait;if(q->count==q->capacity)return 0;memcpy(q->data+((q->head+q->count)%q->capacity)*q->bytes,p,q->bytes);q->count++;return 1;}
int xQueueReceive(QueueHandle_t q,void *p,TickType_t wait){(void)wait;if(!q->count)return 0;memcpy(p,q->data+q->head*q->bytes,q->bytes);q->head=(q->head+1)%q->capacity;q->count--;return 1;}
SemaphoreHandle_t xSemaphoreCreateMutex(void){return calloc(1,sizeof(int));}
int xSemaphoreTake(SemaphoreHandle_t s,TickType_t wait){(void)wait;assert(!*s);*s=1;return 1;}
void xSemaphoreGive(SemaphoreHandle_t s){assert(*s);*s=0;}
int xTaskCreatePinnedToCore(void (*task)(void*),const char *name,unsigned stack,void *arg,unsigned priority,void *handle,unsigned core){(void)task;(void)name;(void)stack;(void)arg;(void)priority;(void)handle;(void)core;return 1;}
size_t heap_caps_get_free_size(unsigned caps){(void)caps;return oom?0:256*1024;}
void *heap_caps_aligned_alloc(size_t align,size_t bytes,unsigned caps){(void)align;(void)caps;return calloc(1,bytes);}
int64_t esp_timer_get_time(void){static int64_t t;return t+=7000;}
aec_handle_t *aec_create_from_config(aec_config_t *c){assert(c->sample_rate==16000&&c->mic_num==1&&c->ref_num==1&&c->mode==AEC_MODE_FD_LOW_COST);aec_handle_t *a=calloc(1,sizeof(*a));a->config=*c;creates++;return a;}
int aec_get_chunksize(const aec_handle_t *a){(void)a;return 512;}
void aec_destroy(aec_handle_t *a){free(a);destroys++;}
void aec_process(const aec_handle_t *a,int16_t *m,int16_t *r,int16_t *o){(void)a;processes++;for(int i=0;i<512;i++)o[i]=m[i]-r[i];}
static void tick(void){block_t b;while(xQueueReceive(input,&b,0))process_block(b);}
static void fill(int16_t *p,int refval,int micval){for(int i=0;i<48;i++){p[2*i]=refval;p[2*i+1]=micval;}}
int main(void){
 assert(aec_service_init()==ESP_OK);int16_t pcm[96],before[96];
 for(int i=0;i<5000;i++){for(int k=0;k<96;k++)pcm[k]=(int16_t)(i*79+k*137);memcpy(before,pcm,sizeof pcm);test_capture(pcm,sizeof pcm,i);assert(!memcmp(before,pcm,sizeof pcm));}assert(processes==0);puts("PASS 5000 off-mode raw PCM blocks remain byte-exact; no AEC invocation");
 oom=true;assert(aec_service_set(true)==ESP_ERR_NO_MEM);assert(!enabled);oom=false;assert(aec_service_set(true)==ESP_OK);g_capture_active=true;
 for(unsigned i=0;i<300;i++){fill(pcm,3000,4000);test_capture(pcm,sizeof pcm,1);if(i<32)for(int k=0;k<96;k++)assert(pcm[k]==0);tick();if(i>100)for(int k=0;k<48;k++)assert(abs(pcm[2*k]-1000)<3&&pcm[2*k]==pcm[2*k+1]);}assert(processes>5);puts("PASS synchronized reference subtraction traverses real FIR/frame queues; priming is silent; mono output duplicated");
 assert(aec_service_set(false)==ESP_OK);fill(pcm,123,789);memcpy(before,pcm,sizeof pcm);test_capture(pcm,sizeof pcm,1);assert(!memcmp(before,pcm,sizeof pcm));assert(!engine);puts("PASS disable destroys algorithm and immediately restores unchanged raw capture");
 assert(aec_service_set(true)==ESP_OK);fill(pcm,0,0);test_capture(pcm,sizeof pcm,2);for(int k=0;k<96;k++)assert(pcm[k]==0);tick();
 for(int i=0;i<140;i++){fill(pcm,0,0);test_capture(pcm,sizeof pcm,2);}assert(drops>0);tick();for(int k=0;k<96;k++)assert(pcm[k]==0);puts("PASS epoch/mode changes and input overload cannot leak previous output or raw playback reference");
 oom=true;fill(pcm,1000,8000);test_capture(pcm,sizeof pcm,77);tick();
 for(int i=0;i<120;i++){fill(pcm,1000,8000);test_capture(pcm,sizeof pcm,77);tick();for(int k=0;k<96;k++)assert(pcm[k]==0);}assert(failed&&!aec_service_enabled());oom=false;
 puts("PASS runtime allocator failure stays silent instead of leaking raw reference into the recording");
 g_usb_suspended=true;fill(pcm,8000,9000);test_capture(pcm,sizeof pcm,2);for(int k=0;k<96;k++)assert(pcm[k]==0);g_usb_suspended=false;
 aec_service_set(false);assert(creates==destroys);uint8_t status[10]={0x7d};aec_service_status(status);assert(status[1]==0xae&&status[4]==0&&status[8]==1);puts("PASS suspend is silent; status and allocator lifecycle are consistent");return 0;
}
