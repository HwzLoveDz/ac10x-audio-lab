#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "bridge_protocol.h"
static unsigned calls;
static bool nak, expected_read;
static uint8_t expected_addr, expected_reg[2], expected_reg_len, expected_width;
static uint8_t expected_write[2];
static bool bus(void *ctx, bool read, uint8_t addr, const uint8_t *reg,
                uint8_t reg_len, uint8_t *data, uint8_t width)
{
    assert(ctx == (void *)0x1234); ++calls;
    assert(read == expected_read && addr == expected_addr);
    assert(reg_len == expected_reg_len && width == expected_width);
    assert(memcmp(reg, expected_reg, reg_len) == 0);
    if (read) { data[0] = 0xab; if (width == 2) data[1] = 0xcd; }
    else assert(memcmp(data, expected_write, width) == 0);
    return !nak;
}
int main(void)
{
    uint8_t q[10] = {1,1,0x66,0,0x45,0,0,1,0,0}, r[10];
    expected_read=true; expected_addr=0x33; expected_reg[0]=0x45;
    expected_reg_len=1; expected_width=1;
    assert(bridge_register_request(q,r,bus,(void *)0x1234));
    const uint8_t read8[10]={1,1,0xab,0,0,0x45,1,1,0x66,0};
    assert(memcmp(r,read8,10)==0);
    q[0]=0x11; q[3]=0x12; q[4]=0x34; q[7]=2;
    expected_reg[0]=0x12; expected_reg[1]=0x34; expected_reg_len=2; expected_width=2;
    assert(bridge_register_request(q,r,bus,(void *)0x1234));
    const uint8_t read16[10]={0x11,1,0xab,0xcd,0x12,0x34,2,1,0x66,0};
    assert(memcmp(r,read16,10)==0);
    q[0]=0x10; q[5]=0x98; q[6]=0x76; expected_read=false;
    expected_write[0]=0x98; expected_write[1]=0x76;
    assert(bridge_register_request(q,r,bus,(void *)0x1234));
    const uint8_t write16[10]={0x10,1,0x98,0x76,0x12,0x34,2,0x66,1,0};
    assert(memcmp(r,write16,10)==0);
    q[0]=0; q[3]=0; q[4]=0x22; q[5]=0x56; q[6]=0; q[7]=1;
    expected_reg[0]=0x22; expected_reg_len=1; expected_width=1; expected_write[0]=0x56;
    assert(bridge_register_request(q,r,bus,(void *)0x1234));
    const uint8_t write8[10]={0,1,0x56,0,0,0x22,1,0x66,1,0};
    assert(memcmp(r,write8,10)==0);
    nak=true;
    assert(!bridge_register_request(q,r,bus,(void *)0x1234) && r[8]==0 && r[2]==0);
    q[0]=1; expected_read=true;
    assert(!bridge_register_request(q,r,bus,(void *)0x1234) && r[7]==0 && r[8]==0x66);
    const unsigned before=calls;
    q[0]=3; assert(!bridge_register_request(q,r,bus,NULL));
    q[0]=1; q[3]=1; assert(!bridge_register_request(q,r,bus,NULL));
    q[3]=0; q[2]=0x67; assert(!bridge_register_request(q,r,bus,NULL));
    q[2]=0x00; assert(!bridge_register_request(q,r,bus,NULL));
    q[2]=0xf0; assert(!bridge_register_request(q,r,bus,NULL));
    q[2]=0x66; q[7]=3; assert(!bridge_register_request(q,r,bus,NULL));
    q[7]=1; q[1]=2; assert(!bridge_register_request(q,r,bus,NULL));
    q[1]=1; q[0]=0x21; assert(!bridge_register_request(q,r,bus,NULL));
    assert(calls==before);
    puts("PASS: actual firmware C protocol; read/write 8/16-bit, NACK offsets, invalid/erase requests blocked");
    return 0;
}
