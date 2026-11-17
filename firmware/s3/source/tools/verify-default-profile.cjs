'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),E=require('../profile-source/examples.js'),C=require('../profile-source/codec.js'),D=require('../profile-source/dsp.js');
const doc=require('../DEFAULT-FIRMWARE.json'),seed=require('../profile-source/AC101S-S31-ECM-Speaker-muted.json');
const text=p=>fs.readFileSync(path.join(root,p),'utf8'),checks=[];
function test(name,fn){fn();checks.push(name);console.log('PASS '+name);}
test('S3 boot and Quick Start use the same clear-vocal canonical config',()=>{
 const c=E.defaultFirmware(seed,{fixedAudio:true,lineDifferential:false});assert.deepEqual(c,doc.config);
 assert.deepEqual(E.quickStart(seed,{fixedAudio:true,lineDifferential:false}),c);
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(c)).digest('hex'),doc.canonicalConfigSHA256);
 assert.equal(doc.canonicalConfigSHA256,'1107934abf64a509b781364eabfd6b49e98f5f28df452237e5156a7f1de7ba59');
 assert.equal(doc.target,'esp32s3');assert.equal(doc.firmwareVersion,'0.3.0');
});
test('all 83 C-header rows equal Quick Start masked targets in both output modes',()=>{
 const h=text('main/codec_default_profile.h'),rows=[...h.matchAll(/\{\s*(0x[\da-f]+),\s*(0x[\da-f]+),\s*(0x[\da-f]+),\s*(0x[\da-f]+)\s*\}/gi)].map(m=>m.slice(1).map(Number));
 assert.equal(rows.length,83);assert(h.includes(doc.canonicalConfigSHA256));
 for(const differential of [false,true]){
  const c=E.defaultFirmware(seed,{fixedAudio:true,lineDifferential:differential});
  const patches=C.encode(c,{groups:['routing','eq','dynamics','clock'],profile:'AC101S',mclkHz:12288000,manualBase:{38:differential?16:0}}).patches;
  assert.equal(patches.length,83);patches.forEach((p,i)=>{
   const f=doc.registerPatches[i];assert.deepEqual(rows[i],[f.address,f.mask,f.single,f.differential]);
   assert.deepEqual([p.address,p.mask,p.value],[f.address,f.mask,f[differential?'differential':'single']]);
   assert.equal(p.mask&~C.masks[p.address],0);assert(p.address>1);
  });
 }
});
test('default playback is USB RX with independent capture and no microphone feedback',()=>{
 const c=doc.config,r=c.routing;assert(c.dac.enabled&&!c.dac.mute&&r.lineOut&&r.rxEnabled);
 assert(r.dac.rx&&!r.dac.rec&&!r.txL.play&&!r.txR.rx);assert.equal(c.dac.gain,0);assert.equal(r.lineGain,0);
 assert(c.adc.enabled&&!c.adc.mute&&r.mbias&&r.txEnabled&&r.sdoEnabled);assert(!c.agc.enabled&&!c.hpf.enabled);
 assert.equal(doc.registerPatches.find(p=>p.address===6).single,0x3f);
});
test('voice EQ has quantized stability and nominal headroom',()=>{
 assert.deepEqual(doc.config.eq,E.eq('voice',48000));assert(C.eqCoefficients(doc.config).every(b=>D.stable(b.fixed.map(v=>v/65536))));
 let peak=-Infinity;for(let i=0;i<8192;i++)peak=Math.max(peak,D.cascadeDb(doc.config.eq.bands,20*Math.pow(23900/20,i/8191),48000,doc.config.eq.preGain));
 assert(peak<-.5);assert(Math.abs(peak-doc.nominalEQPeakDb)<1e-9);
});
test('startup clocks precede default initialization and USB exposure follows verification',()=>{
 const main=text('main/main.c');const a=main.indexOf('audio_bridge_init()'),b=main.indexOf('codec_default_bootstrap()'),c=main.indexOf('usb_descriptors_init()'),d=main.indexOf('usb_new_phy(');
 assert(a>=0&&a<b&&b<c&&c<d);assert(!main.includes('ESP_ERROR_CHECK(codec_default_bootstrap'));
 assert(main.includes('HID recovery available'));assert(!main.includes('gpio_set_level(7'));
 const hid=text('main/hid_bridge.c');assert(hid.includes('transfer(NULL, true, 0x33'));assert(hid.includes('transfer(NULL, false, 0x33'));
});
test('S3 PHY, clocks, USB identity and GPIO mapping remain S3-specific',()=>{
 assert(text('main/main.c').includes('USB_PHY_TARGET_INT'));assert(!text('main/main.c').includes('USB_PHY_TARGET_UTMI'));
 assert(text('main/audio_bridge.c').includes('I2S_CLK_SRC_DEFAULT'));assert(!text('main/audio_bridge.c').includes('I2S_CLK_SRC_APLL'));
 const cfg=text('sdkconfig.defaults');['MCLK','BCLK','LRCK','DOUT','DIN','SDA','SCL'].forEach((n,i)=>assert(cfg.includes('CONFIG_BRIDGE_'+n+'_GPIO='+(i+8))));
 const pins=text('main/board_pins.h');assert(pins.includes('BRIDGE_USB_PID 0x4005'));assert(pins.includes('BRIDGE_USB_BCD 0x0200'));
 assert(text('main/usb_descriptors.c').includes('AC10x S3 Duplex'));
});
test('no erase/reset/NVS operations were added; stream fade is restricted to playback',()=>{
 for(const name of ['main.c','codec_default.c','hid_bridge.c','audio_bridge.c'])assert(!/nvs_flash_erase|esp_restart|esp_flash_erase|spi_flash_erase/.test(text('main/'+name)));
 const audio=text('main/audio_bridge.c');assert.equal((audio.match(/stream_fade_apply\(/g)||[]).length,1);
 assert(!audio.slice(audio.indexOf('static void capture_task')).includes('stream_fade_apply'));
});
const result={result:'PASS',checks,checkCount:checks.length,canonicalConfigSHA256:doc.canonicalConfigSHA256,registerPatches:83,hardware:'NOT RUN',flashed:false};
fs.writeFileSync(path.join(root,'evidence/default-profile-check.json'),JSON.stringify(result,null,2)+'\n');
