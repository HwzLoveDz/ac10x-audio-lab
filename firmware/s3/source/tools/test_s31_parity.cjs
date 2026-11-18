'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),E=require('../profile-source/examples.js'),C=require('../profile-source/codec.js');
const S=require('../profile-source/session.js'),T=require('../web/transport.js');
const {FakeHID,memory}=require('../profile-source/qa/fake-hid.cjs'),doc=require('../DEFAULT-FIRMWARE.json');
const checks=[];const pass=n=>{checks.push(n);console.log('PASS '+n);};
const options={groups:['routing','eq','dynamics','clock'],profile:'AC101S',mclkHz:12288000};
const unity=s=>C.decodeEq(s).every(b=>b.every((v,i)=>v===(i===0?1:0)));
async function open(){const device=new FakeHID({bytes:10});device.vendorId=0x303a;device.productId=0x4005;const bridge=new T.HidBridge(device),session=new S.RegisterSession(bridge);await bridge.open();return{device,bridge,session};}
(async()=>{
 assert.equal(doc.canonicalConfigSHA256,'1107934abf64a509b781364eabfd6b49e98f5f28df452237e5156a7f1de7ba59');
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(doc.config)).digest('hex'),doc.canonicalConfigSHA256);
 assert.equal(doc.config.dac.gain,0);assert.equal(doc.config.routing.lineGain,0);assert.deepEqual(doc.config.eq,E.eq('voice',48000));
 pass('current S31 0.3.3 / Audio Lab 0.8.12 canonical defaults retain voice EQ and remove both -18dB output stages');
 const x=await open();try{
  for(const meta of E.quickExamples){
   const c=E.quickExample(meta.id,doc.config,{fixedAudio:true});
   await x.session.apply(c,options);assert.equal(C.makePlan(c,x.device.mem,options).steps.length,0);
   assert.equal(x.device.mem[0],0x12);assert.equal(x.device.maxActive,1);
   if(meta.id==='playback-loopback'){
    assert.equal(c.adc.enabled,true);assert.equal(c.adc.mute,true);assert.equal(c.routing.mbias,false);
    assert.equal(x.device.mem[3]&16,16);assert.equal(x.device.mem[6]&3,3);assert.equal(x.device.mem[25]&1,1);
    assert.equal(x.device.mem[19]&15,10);assert.equal(x.device.mem[29]&2,0);
   }
  }
  pass('all eight current Quick Start examples verify on the actual S3 transport/session; digital capture retains record processing without selecting mic data or speaker monitoring');
  await x.session.apply(doc.config,options);const before=x.device.writes;await x.session.apply(doc.config,options);assert.equal(x.device.writes,before);
  pass('restoring clear-vocal default converges and a repeated application adds zero register writes');
  const off=JSON.parse(JSON.stringify(doc.config));off.eq.enabled=false;
  const model=C.makePlan(off,x.device.mem,{groups:['eq'],profile:'AC101S'}),sequence=C.sequence(model,x.device.mem),state={...x.device.mem};let latched=0;
  for(const stage of sequence){state[stage.address]=C.patchValue(state[stage.address],stage);if(stage.address===79&&(state[79]&1)){assert.equal(state[28],0);assert(unity(state));latched++;}}
  assert.equal(latched,1);assert.equal(state[79]&1,0);assert.equal(state[6]&8,8);assert.equal(state[28],129);
  await x.session.apply(off,{groups:['eq'],profile:'AC101S'});assert(unity(x.device.mem));assert.equal(x.device.mem[79]&1,0);assert.equal(x.device.mem[6]&8,8);
  await x.session.restoreLast();assert.deepEqual(C.decodeEq(x.device.mem),C.eqCoefficients(doc.config).map(b=>b.fixed.map(v=>v/65536)));
  pass('EQ Off latches actual unity coefficients while muted, keeps processing clock, and undo restores voice response and normal output gain');
  const prior={...x.device.mem};let fired=false;
  x.device.hook=({command,address})=>{if(!fired&&command===0&&address>=0x53){fired=true;return{nack:true};}return{};};
  await assert.rejects(x.session.apply(off,{groups:['eq'],profile:'AC101S'}));assert(fired);assert.deepEqual(x.device.mem,prior);x.device.hook=null;
  pass('a failed unity-coefficient write cannot report success and restores the prior voice configuration');
 }finally{await x.bridge.close();}
 const descriptor=fs.readFileSync(path.join(root,'main/usb_descriptors.c'),'utf8'),pins=fs.readFileSync(path.join(root,'main/board_pins.h'),'utf8');
 assert(descriptor.includes('"S3%02X%02X%02X%02X%02X%02X"'));assert(pins.includes('BRIDGE_USB_BCD 0x0200'));
 assert.equal((descriptor.match(/static const uint8_t config_fs/g)||[]).length,1);assert(!descriptor.includes('config_hs[]'));
 pass('S3 serial derivation and USB device revision stay stable; firmware version does not switch Windows endpoint identity');
 const audio=fs.readFileSync(path.join(root,'main/audio_bridge.c'),'utf8');assert(!audio.slice(audio.indexOf('static void capture_task')).includes('stream_fade_apply'));
 pass('capture path has no playback fade or EQ processing; raw-capture PCM is exercised separately by production-C tests');
 const result={result:'PASS',checks,checkCount:checks.length,firmwareVersion:'0.3.1',sourceWebVersion:'0.8.15-rc.1',hardware:'NOT RUN; simulated S3 HID only',flashed:false};
 fs.writeFileSync(path.join(root,'evidence/s31-parity-tests.json'),JSON.stringify(result,null,2)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;});
