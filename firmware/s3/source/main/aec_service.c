// Opt-in MCU processing. Playback and the off-mode raw capture path are unchanged.
#include "aec_service.h"
#include "aec_resample.h"
#include "esp_aec.h"
#include "esp_heap_caps.h"
#include "esp_timer.h"
#include "esp_rom_sys.h"
#include "esp_attr.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "freertos/semphr.h"
#include "bridge.h"
#include "audio_pipe.h"
#include <string.h>
typedef struct { uint32_t epoch,generation; uint16_t bytes; int16_t pcm[96]; } block_t;
static QueueHandle_t input,output;
static SemaphoreHandle_t lock;
static _Atomic bool enabled,failed;
static bool ready;
static _Atomic uint32_t generation, drops, frames, max_us, faults;
static aec_handle_t *engine; // Serialized by lock; never accessed from USB/ISR.
static int16_t *mic,*ref,*clean;
static int frame_size;
static RTC_NOINIT_ATTR struct { uint32_t magic,stage,heap,stack; } trace;
void aec_trace(uint8_t stage) { trace.magic=0xaec0317; trace.stage=stage; }
void aec_diag(uint8_t p[10]) { p[1]=0xad; p[2]=trace.magic==0xaec0317?trace.stage:0; p[3]=esp_reset_reason(); p[4]=trace.heap/1024; p[5]=trace.heap/1024/256; p[6]=trace.stack; p[7]=trace.stack/256; p[8]=1; p[9]=1; }

static bool create_engine(void) {
    aec_trace(30);
    if(engine) aec_destroy(engine);
    engine=NULL;
    aec_trace(31);
    size_t free=heap_caps_get_free_size(MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT);
    trace.heap=free; trace.stack=uxTaskGetStackHighWaterMark(NULL); aec_trace(32);
    esp_rom_printf("AEC create: free=%u largest=%u stack=%u\n",(unsigned)free,(unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL|MALLOC_CAP_8BIT),(unsigned)uxTaskGetStackHighWaterMark(NULL));
    aec_trace(33);
    if(free<192*1024) return false;
    aec_config_t cfg={.mic_num=1,.ref_num=1,.out_num=1,.filter_length=4,
        .sample_rate=16000,.caps=MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT|MALLOC_CAP_SIMD,
        .mode=AEC_MODE_FD_LOW_COST,.nlp_level=AEC_NLP_LEVEL_NORMAL};
    esp_rom_printf("AEC vendor create begin\n");
    aec_trace(36); engine=aec_create_from_config(&cfg); aec_trace(37);
    esp_rom_printf("AEC vendor create returned=%d\n",engine!=NULL);
    if(!engine) return false;
    aec_trace(38); frame_size=aec_get_chunksize(engine);
    if(frame_size<1||frame_size>512) { aec_destroy(engine); engine=NULL; return false; }
    return true;
}
bool aec_service_enabled(void) { return enabled&&!failed; }
esp_err_t aec_service_set(bool on) {
    if(on) aec_trace(20);
    if(!ready) return on?ESP_ERR_INVALID_STATE:ESP_OK;
    if(!on&&enabled) { enabled=false; failed=false; atomic_fetch_add(&generation,1); audio_pipe_invalidate(); }
    if(on) aec_trace(21);
    if(xSemaphoreTake(lock,pdMS_TO_TICKS(900))!=pdTRUE) return ESP_ERR_TIMEOUT;
    if(on) aec_trace(22);
    esp_err_t result=ESP_OK;
    if(on&&(!enabled||failed)) {
        if(create_engine()) { atomic_fetch_add(&generation,1); audio_pipe_invalidate(); enabled=true; failed=false; }
        else { ++faults; result=ESP_ERR_NO_MEM; }
    } else if(!on&&engine) { aec_destroy(engine); engine=NULL; }
    xSemaphoreGive(lock); return result;
}
void aec_service_status(uint8_t p[10]) {
    // Versioned signature; old firmware replies with a zeroed unsupported packet.
    p[1]=0xae; p[2]=1; p[3]=1; p[4]=enabled&&!failed; p[5]=(uint8_t)faults;
    p[6]=(uint8_t)drops; p[7]=(uint8_t)(atomic_load(&max_us)/1000); p[8]=1; p[9]=(uint8_t)frames;
}
void aec_service_capture(int16_t *stereo,size_t bytes,uint32_t epoch) {
    if(!enabled) return; // Exact raw PCM bypass when AEC is disabled.
    if(!bytes||bytes>192||bytes%4) return;
    block_t b={.epoch=epoch,.generation=generation,.bytes=(uint16_t)bytes};
    if(!g_capture_active||g_usb_suspended) { memset(stereo,0,bytes); return; }
    memcpy(b.pcm,stereo,bytes);
    if(xQueueSend(input,&b,0)!=pdTRUE) { ++drops; atomic_fetch_add(&generation,1); }
    memset(stereo,0,bytes); // No raw/reference leakage while priming or recovering.
    static block_t held;
    static size_t offset=192;
    size_t written=0;
    while(written<bytes) {
        if(held.epoch!=epoch||held.generation!=generation) offset=192;
        if(offset>=192) {
            bool found=false;
            for(unsigned i=0;i<64&&xQueueReceive(output,&held,0)==pdTRUE;i++) {
                if(held.epoch==epoch&&held.generation==generation&&held.bytes==192) { offset=0; found=true; break; }
            }
            if(!found) break;
        }
        size_t take=bytes-written<192-offset?bytes-written:192-offset;
        memcpy((uint8_t*)stereo+written,(uint8_t*)held.pcm+offset,take);
        offset+=take; written+=take;
    }
}
static void process_block(block_t b) {
    static block_t out;
    static unsigned used,out_frames;
    static uint32_t last_epoch=UINT32_MAX,last_gen=UINT32_MAX;
    static aec_decimator_t down;
    static aec_interpolator_t up;
        if(!enabled||b.generation!=generation||b.epoch!=audio_pipe_epoch()) return;
        if(xSemaphoreTake(lock,pdMS_TO_TICKS(100))!=pdTRUE) { ++drops; return; }
        if(!enabled||b.generation!=generation||b.epoch!=audio_pipe_epoch()) { xSemaphoreGive(lock); return; }
        if(b.epoch!=last_epoch||b.generation!=last_gen) {
            used=out_frames=0; aec_resample_reset(&down,&up);
            if(last_epoch!=UINT32_MAX&&!create_engine()) { failed=true; ++faults; }
            last_epoch=b.epoch; last_gen=b.generation;
        }
        if(!enabled||!engine) { xSemaphoreGive(lock); return; }
        for(unsigned i=0;i<b.bytes/4;i++) {
            if(!aec_decimate(&down,b.pcm[i*2],b.pcm[i*2+1],&ref[used],&mic[used])) continue;
            if(++used!=(unsigned)frame_size) continue;
            int64_t start=esp_timer_get_time();
            aec_process(engine,mic,ref,clean); // Real vendor adaptive AEC + residual suppression.
            uint32_t elapsed=(uint32_t)(esp_timer_get_time()-start); if(elapsed>max_us) max_us=elapsed;
            ++frames; used=0;
            for(int j=0;j<frame_size;j++) {
                int16_t pcm[3]; aec_interpolate(&up,clean[j],pcm);
                for(unsigned k=0;k<3;k++) {
                    out.pcm[out_frames*2]=out.pcm[out_frames*2+1]=pcm[k];
                    if(++out_frames==48) {
                        out.epoch=b.epoch; out.generation=b.generation; out.bytes=192;
                        if(enabled&&g_capture_active&&!g_usb_suspended&&b.epoch==audio_pipe_epoch()&&b.generation==generation&&xQueueSend(output,&out,0)!=pdTRUE) { ++drops; atomic_fetch_add(&generation,1); }
                        out_frames=0;
                    }
                }
            }
        }
        xSemaphoreGive(lock);
}
static void worker(void *unused) {
    (void)unused; block_t b;
    for(;;) if(xQueueReceive(input,&b,pdMS_TO_TICKS(10))==pdTRUE) process_block(b);
}
esp_err_t aec_service_init(void) {
    lock=xSemaphoreCreateMutex();
    input=xQueueCreate(64,sizeof(block_t)); output=xQueueCreate(64,sizeof(block_t));
    mic=heap_caps_aligned_alloc(16,512*sizeof(int16_t),MALLOC_CAP_8BIT);
    ref=heap_caps_aligned_alloc(16,512*sizeof(int16_t),MALLOC_CAP_8BIT);
    clean=heap_caps_aligned_alloc(16,512*sizeof(int16_t),MALLOC_CAP_8BIT);
    if(!lock||!input||!output||!mic||!ref||!clean) { ++faults; return ESP_ERR_NO_MEM; }
    ready=xTaskCreatePinnedToCore(worker,"aec-16k",8192,NULL,3,NULL,1)==pdPASS;
    if(!ready) ++faults;
    return ready?ESP_OK:ESP_ERR_NO_MEM;
}
