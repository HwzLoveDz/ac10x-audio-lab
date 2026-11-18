'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const T=require('../transport.js'),C=require('../codec.js'),E=require('../examples.js'),R=require('../routing.js'),D=require('../debug.js');
const {FakeHID,config,memory}=require('./fake-hid.cjs'),{make,copy}=require('./verify-properties.cjs');
let n=0;const pass=s=>{console.log('PASS '+s);n++;};
async function fixture(fn,{kind='S3',modern=true}={}){
 const d=new FakeHID({bytes:kind==='TI'?64:10});if(kind!=='TI'){d.vendorId=0x303a;d.productId=kind==='S3'?0x4005:0x4004;Object.assign(d.mem,{12:0x73,13:0});}d.dmicFirmware=modern;d.aecFirmware=modern;
 const x=make({device:d}),H=x.w.AudioHardwareUI;
 try{await x.flush();await H.connect();await x.flush();await fn(x,H,d);x.invariant();assert.ok(d.maxActive<=1);}finally{x.close();}
}
(async()=>{
 const reply=[0x7a,0xd4,1,7,0,3,1,48,48,1],decoded=T.decode(Uint8Array.from(reply),{command:0x7a});
 assert.equal(decoded.firmwareVersion,'0.3.1');assert(decoded.dmic48&&decoded.aec&&decoded.analog);assert.equal(decoded.usbRate,48000);assert.equal(decoded.i2sRate,48000);
 assert.deepEqual(Array.from(T.encode({command:0x7a},10)),[0x7a,1,0,0,0,0,0,0,0,0]);
 assert.equal(T.decode(Uint8Array.from([0x7a,0,0,0,0,0,0,0,0,0]),{command:0x7a}).supported,false);
 for(const [index,value] of [[1,0xd5],[2,2],[3,8],[7,16],[8,16],[9,0]]){const r=[...reply];r[index]=value;assert.throws(()=>T.decode(Uint8Array.from(r),{command:0x7a}));}
 const producer=fs.readFileSync(path.join(__dirname,'../firmware/s3/source/main/hid_bridge.c'),'utf8');assert(producer.includes('{0x7a,0xd4,1,7,0,3,1,48,48,1}'));
 pass('capability encoder/decoder matches the real firmware producer and rejects malformed replies');
 for(const profile of ['AC101S','AC102'])for(const rate of [8000,16000,24000,32000,44100,48000]){
  const c=E.quickExample('default',config(),{inputMode:'dmic',fixedAudio:false});c.profile=profile;c.clock.fs=rate;
  const supported=profile==='AC101S'?[16000,48000].includes(rate):rate<=24000;assert.equal(R.dmicSupported(c),supported);
  if(supported){const patches=C.encode(c,{groups:['routing'],profile,mclkHz:rate*256,manualBase:memory()}).patches;assert.equal(patches.find(p=>p.address===25).value&128,128);assert.equal(patches.find(p=>p.address===32).value&1,0);}
  else assert.throws(()=>C.encode(c,{groups:['routing'],profile,mclkHz:rate*256,manualBase:memory()}),/DMIC/);
 }
 pass('AC101S 16/48 and AC102 8–24 rate models reject unsupported combinations and bypass PGA');
 const seed=config();seed.profile='AC101S';const plain=E.quickExample('default',seed),amic=E.quickExample('default',seed,{inputMode:'analog'}),dmic=E.quickExample('default',seed,{inputMode:'dmic',fixedAudio:true});
 assert.deepEqual(plain,amic);assert.equal(plain.routing.input,'analog');assert.deepEqual(plain.eq,dmic.eq);assert.equal(dmic.dac.gain,0);assert.equal(dmic.routing.lineGain,0);assert.equal(dmic.routing.dac.rec,false);assert.equal(E.quickExamples.length,9);
 const g=R.graph(dmic);assert(g.edges.find(e=>e.id==='dmic-data').on);assert(!g.edges.find(e=>e.id==='mic-pga').on);dmic.adc.enabled=false;for(const id of ['dmic-data','dmic-clock','dmic-mux'])assert.equal(R.graph(dmic).edges.find(e=>e.id===id).on,false);
 pass('analog default and clear-vocal playback are unchanged; DMIC graph follows the actual capture enable');
 await fixture(async(x,H,d)=>{
  const before=copy(x.A.getConfig()),writes=d.writes;x.$('#quickStart').click();x.$('#quickStartMic').value='dmic';x.event(x.$('#quickStartMic'),'change');assert.equal(d.writes,writes);assert.deepEqual(copy(x.A.getConfig()),before);
  for(const lang of ['en','zh-CN']){x.w.AudioI18n.setLanguage(lang);if(lang==='en')assert.doesNotMatch(x.$('#quickStartPicker').textContent,/[\u3400-\u9fff]/);assert.equal(x.$('#quickStartMic').value,'dmic');}
  for(const meta of E.quickExamples){await H.quickStart(meta.id);assert.equal(H.getState().quickStart.phase,'verified',H.getState().failure);assert.equal(d.mem[25]&128,128);assert.equal(d.mem[32]&1,0);assert.equal(d.aecEnabled,Boolean(meta.requiresS3AEC));}
  await H.quickStart('default');assert.equal(H.getState().quickStart.phase,'verified');x.$('#closeQuickStart').click();x.A.openNode('pga');assert(x.$('[data-bind="pga"]').matches(':disabled'));x.A.openNode('bias');assert(x.$('[data-bind="routing.mbias"]').matches(':disabled'));
  const diag=x.w.AudioDebug.diagnose(d.mem,{stale:false,adapter:{kind:'S3'},status:{clockGate:true,protocolVersion:'0.1',capabilities:x.w.AudioHardwareTransport.deviceCapabilities(d)}});assert(diag.some(row=>row.id==='record'&&row.title==='数字录音通道已开启'));assert(diag.some(row=>row.id==='audio-capabilities'));
  x.$('#quickStartMic').value='analog';await H.quickStart('default');assert.equal(H.getState().quickStart.phase,'verified');assert.equal(d.mem[25]&128,0);assert.equal(d.mem[32]&1,1);assert.equal(d.aecEnabled,false);assert.equal(x.A.getConfig().routing.input,'analog');
  assert.equal(x.$('[data-quick-apply="default"]').disabled,false);
 });pass('all nine real UI workflows support selected DMIC, AEC, disabled analog controls, bilingual hints and AMIC restoration');
 for(const kind of ['S31','S3'])await fixture(async(x,H,d)=>{
  const before={...d.mem};x.$('#quickStartMic').value='dmic';x.event(x.$('#quickStartMic'),'change');assert.equal(x.$('[data-quick-apply="default"]').disabled,true);await H.quickStart('default');assert.equal(H.getState().quickStart.phase,'error');assert.deepEqual(d.mem,before);assert.equal(d.writes,0);
  assert.throws(()=>x.w.AudioCodec.assertAdapterRegister(25,128,d),/DMIC/);
  x.$('#quickStartMic').value='analog';await H.quickStart('default');assert.equal(H.getState().quickStart.phase,'verified',H.getState().failure);
 },{kind,modern:false});pass('S31 and old S3 reject DMIC writes before mutation while retaining analog Quick Start');
 await fixture(async(x,H,d)=>{
  x.$('#quickStartMic').value='dmic';let changed=false;d.hook=({command})=>{if(command===0x7d&&!changed){changed=true;x.$('#quickStartMic').value='analog';x.event(x.$('#quickStartMic'),'change');}return{};};
  await H.quickStart('default');assert(changed);assert.equal(H.getState().quickStart.phase,'verified',H.getState().failure);assert.equal(d.mem[25]&128,128);assert.equal(x.A.getConfig().routing.input,'dmic');
 });pass('changing the selector during an asynchronous query cannot change the submitted input mode');
 await fixture(async(x,H,d)=>{
  assert(x.w.AudioHardwareTransport.deviceCapabilities(d).dmic48);x.$('#hwDisconnect').click();await x.wait(()=>!H.getState().busy);assert.equal(x.w.AudioHardwareTransport.deviceCapabilities(d),null);
 });pass('disconnect removes firmware capability state so a later device cannot inherit DMIC support');
 console.log(n+' DMIC regression groups; isolated fake HID and DOM only');
})().catch(e=>{console.error(e);process.exitCode=1;});
