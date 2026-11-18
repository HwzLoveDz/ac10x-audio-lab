#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "codec_default.h"
#include "codec_default_profile.h"
#include "stream_fade.h"

typedef struct {
    uint8_t regs[256], initial[256];
    unsigned operations, fail_at, writes, reads, delay_total, delay_calls;
    bool absent, ignore_coefficient, corrupt_clock_after_ramp;
} fake_t;
static unsigned scenarios;
static const codec_default_patch_t *find(uint8_t address)
{
    for (size_t i=0;i<CODEC_DEFAULT_PATCH_COUNT;++i)
        if(codec_default_patches[i].address==address) return &codec_default_patches[i];
    return NULL;
}
static uint8_t desired(const fake_t *f,const codec_default_patch_t *p)
{ return (f->initial[38]&16) ? p->differential : p->single; }
static bool read_reg(void *ctx,uint8_t address,uint8_t *value)
{
    fake_t *f=ctx;++f->reads;++f->operations;
    if(f->absent || f->operations==f->fail_at) return false;
    *value=f->regs[address];return true;
}
static bool write_reg(void *ctx,uint8_t address,uint8_t value)
{
    fake_t *f=ctx;++f->writes;++f->operations;
    const codec_default_patch_t *p=find(address);
    assert(p && address>1); // Never reset, ID, calibration or reserved registers.
    assert(((value^f->regs[address]) & (uint8_t)~p->mask)==0);
    if(f->operations==f->fail_at) return false;
    if(address==28 && value && !f->fail_at) {
        // Unmute only after coefficient writes, analog enable and serial resume.
        for(size_t i=0;i<CODEC_DEFAULT_PATCH_COUNT;++i) {
            const codec_default_patch_t *q=&codec_default_patches[i];
            if(q->address!=28) assert((f->regs[q->address]&q->mask)==desired(f,q));
        }
        assert(f->delay_total>=80);
    }
    if(!(f->ignore_coefficient && address==80)) f->regs[address]=value;
    if(f->corrupt_clock_after_ramp && address==28 && value==find(28)->single)
        f->regs[6]^=8;
    return true;
}
static void delay_ms(void *ctx,unsigned ms)
{ fake_t *f=ctx;f->delay_total+=ms;++f->delay_calls;assert(f->delay_total<1000); }
static codec_default_io_t io(fake_t *f)
{ return (codec_default_io_t){.context=f,.read=read_reg,.write=write_reg,.delay_ms=delay_ms}; }
static void setup(fake_t *f,unsigned seed,bool differential)
{
    memset(f,0,sizeof(*f));
    for(unsigned a=0;a<256;++a) f->regs[a]=(uint8_t)(a*73+seed*37);
    f->regs[0]=0x12;f->regs[38]=(f->regs[38]&~16)|(differential?16:0);
    memcpy(f->initial,f->regs,sizeof(f->regs));
}
static void matches(fake_t *f)
{
    for(unsigned a=0;a<256;++a) {
        const codec_default_patch_t *p=find((uint8_t)a);
        if(p) {
            assert((f->regs[a]&p->mask)==desired(f,p));
            assert(((f->regs[a]^f->initial[a]) & (uint8_t)~p->mask)==0);
        } else assert(f->regs[a]==f->initial[a]);
    }
}
int main(void)
{
    fake_t f;unsigned normal_operations;
    assert(CODEC_DEFAULT_PATCH_COUNT==83);
    assert(find(6)->single==0x3f); // Keep EQ-bypass and ADC serial pipeline clocks.
    for(unsigned mode=0;mode<2;++mode) for(unsigned seed=0;seed<64;++seed) {
        setup(&f,seed,mode);codec_default_io_t d=io(&f);
        assert(codec_default_initialize(&d));matches(&f);++scenarios;
    }
    setup(&f,0,false);codec_default_io_t d=io(&f);
    assert(codec_default_initialize(&d));normal_operations=f.operations;
    for(unsigned mode=0;mode<2;++mode) for(unsigned fault=1;fault<=normal_operations;++fault) {
        setup(&f,0,mode);f.fail_at=fault;d=io(&f);
        const bool ok=codec_default_initialize(&d);
        if(ok) matches(&f);
        else {assert(f.regs[28]==0);assert(!(f.regs[38]&32));}
        assert(f.operations<normal_operations+12);++scenarios;
    }
    setup(&f,0,false);f.regs[0]=0x11;d=io(&f);
    assert(!codec_default_initialize(&d));assert(f.writes==0);++scenarios;
    setup(&f,0,false);f.absent=true;d=io(&f);
    assert(!codec_default_initialize(&d));assert(f.writes==0 && f.reads==5 && f.delay_total==100);++scenarios;
    setup(&f,0,false);f.ignore_coefficient=true;
    f.regs[80]=(f.regs[80]&~find(80)->mask)|((find(80)->single^1)&find(80)->mask);d=io(&f);
    assert(!codec_default_initialize(&d));assert(f.regs[28]==0 && !(f.regs[38]&32));++scenarios;
    setup(&f,0,false);f.corrupt_clock_after_ramp=true;d=io(&f);
    assert(!codec_default_initialize(&d));assert(f.regs[28]==0 && !(f.regs[38]&32));++scenarios;
    assert(!codec_default_initialize(NULL));d=io(&f);d.read=NULL;assert(!codec_default_initialize(&d));++scenarios;
    stream_fade_t fade={0};int16_t pcm[48*2];
    for(unsigned b=0;b<6;++b) {
        for(unsigned i=0;i<48;++i){pcm[2*i]=32767;pcm[2*i+1]=-32768;}
        stream_fade_apply(&fade,pcm,48,7,true);
        for(unsigned i=0;i<48;++i) {
            unsigned n=b*48+i;
            assert(pcm[2*i]==(n<240?(int16_t)(32767*(int)n/240):32767));
            assert(pcm[2*i+1]==(n<240?(int16_t)(-32768*(int)n/240):-32768));
        }
    }
    stream_fade_apply(&fade,pcm,48,7,false);assert(!fade.valid);
    stream_fade_apply(&fade,pcm,48,8,true);assert(pcm[0]==0 && pcm[1]==0);++scenarios;
    printf("PASS %u default-profile scenarios: both output modes, 83 masks, every-operation faults, ID/NACK/readback/final verification and 5ms fade\n",scenarios);
    return 0;
}
