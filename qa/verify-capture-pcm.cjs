'use strict';
const assert=require('node:assert/strict'),{Recorder}=require('../capture.js');
let n=0;const pass=s=>{console.log('PASS '+s);n++;},tick=()=>new Promise(setImmediate);
function fixture({length=48020,decode=null,badMime=false}={}){
 const timers=[],before={setTimeout:global.setTimeout,clearTimeout:global.clearTimeout};
 global.setTimeout=(fn,ms)=>{const t={fn,ms};timers.push(t);return t;};global.clearTimeout=t=>{if(t)t.cancelled=true;};
 const track={stopped:false,events:{},stop(){this.stopped=true;},addEventListener(name,fn){this.events[name]=fn;},getSettings(){return{sampleRate:48000,echoCancellation:false,noiseSuppression:false,autoGainControl:false,deviceId:'private-input',groupId:'private-group'};}};
 const stream={getTracks:()=>[track],getAudioTracks:()=>[track]},instances=[],results=[],errors=[];
 const samples=[Float32Array.from({length},(_,i)=>i%13/20),Float32Array.from({length},(_,i)=>-i%7/20)];
 const buffer={sampleRate:48000,numberOfChannels:2,length,getChannelData:i=>samples[i]};
 class PCM{
  static isTypeSupported(mime){assert.equal(mime,'audio/webm;codecs=pcm');return true;}
  constructor(s,opt){assert.equal(s,stream);assert.equal(opt.mimeType,'audio/webm;codecs=pcm');this.mimeType=badMime?'audio/webm;codecs=opus':opt.mimeType;this.state='inactive';instances.push(this);}
  start(ms){assert.equal(ms,250);this.state='recording';this.onstart?.();}
  stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob([new Uint8Array([1,2,3,4])])});this.onstop?.();});}
 }
 class Offline{constructor(ch,frames,fs){assert.deepEqual([ch,frames,fs],[2,1,48000]);}async decodeAudioData(bytes){assert(bytes.byteLength>0);return decode?decode(buffer):buffer;}}
 const r=new Recorder({media:{getUserMedia:async()=>stream},Context:class{constructor(){throw Error('Realtime output clock must not be opened');}},PCMRecorder:PCM,OfflineContext:Offline,onDone:x=>results.push(x),onError:e=>errors.push(e.message)});
 return{r,track,results,errors,instances,samples,fire(ms){const t=timers.find(t=>t.ms===ms&&!t.cancelled);assert(t,'Missing timer '+ms);t.fn();},async flush(){for(let i=0;i<4;i++)await tick();},close(){r.close();Object.assign(global,before);}};
}
(async()=>{
 let x=fixture();try{
  await x.r.start('private-input',1);assert.equal(x.r.state,'recording');x.fire(1150);await x.flush();assert.equal(x.r.state,'idle');assert.equal(x.results.length,1);const v=x.results[0];assert.equal(v.engine,'MediaRecorder PCM');assert.equal(v.sampleRate,48000);assert.equal(v.seconds,1);assert.equal(v.channels[0].length,48000);assert.deepEqual(v.channels[1],x.samples[1].subarray(0,48000));assert(x.track.stopped);assert.deepEqual(x.errors,[]);assert.doesNotMatch(JSON.stringify(v.settings),/private-|deviceId|groupId/);
 }finally{x.close();}pass('lossless PCM capture follows the input stream, keeps exact stereo samples and duration, and uses no realtime output clock');
 x=fixture({length:12000});try{await x.r.start('private-input',10);x.r.stop(true);await x.flush();assert.equal(x.results[0].seconds,.25);assert.equal(x.results[0].channels[0][10],x.samples[0][10]);}finally{x.close();}pass('manual stop keeps the acquired raw PCM without padding or EQ processing');
 x=fixture({length:1000});try{await x.r.start('private-input',1);x.fire(1150);await x.flush();assert.equal(x.results.length,0);assert.match(x.errors[0],/样本不足/);assert(x.track.stopped);}finally{x.close();}pass('an automatic recording with missing samples cannot report a complete duration');
 let release;x=fixture({decode:b=>new Promise(resolve=>release=()=>resolve(b))});try{await x.r.start('private-input',1);x.r.stop(true);await x.flush();assert.equal(x.r.state,'processing');assert.equal(typeof release,'function');x.r.stop(false);release();await x.flush();assert.equal(x.results.length,0);assert.equal(x.r.state,'idle');assert(x.track.stopped);}finally{x.close();}pass('cancellation while decoding rejects the late completion and releases the microphone');
 x=fixture({badMime:true});try{await assert.rejects(x.r.start('private-input',1),/无损 PCM/);assert(x.track.stopped);assert.equal(x.results.length,0);}finally{x.close();}pass('a browser cannot silently replace requested PCM with Opus or another lossy codec');
 x=fixture();try{await x.r.start('private-input',1);x.instances[0].ondataavailable({data:{size:99999999}});assert.equal(x.r.state,'idle');assert.equal(x.results.length,0);assert.match(x.errors[0],/时长上限/);assert(x.track.stopped);}finally{x.close();}
 x=fixture();try{await x.r.start('private-input',1);x.track.events.ended();await x.flush();assert.equal(x.r.state,'idle');assert.equal(x.results.length,0);assert.match(x.errors[0],/断开/);}finally{x.close();}pass('oversized data and device removal stop capture and discard incomplete PCM');
 console.log(n+' lossless PCM capture checks; fake input and codec only');
})().catch(e=>{console.error(e);process.exitCode=1;});
