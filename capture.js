/* Bounded browser PCM capture. Explicit permission and exact selected input; no monitor audio. */
(function(root){
'use strict';
const workletSource=`class AC10xCapture extends AudioWorkletProcessor {
 process(inputs,outputs){ const channels=inputs[0]||[];if(channels.length){const data=channels.slice(0,2).map(ch=>Float32Array.from(ch));this.port.postMessage(data,data.map(ch=>ch.buffer));}for(const out of outputs)for(const ch of out)ch.fill(0);return true; }
} registerProcessor('ac10x-pcm-capture',AC10xCapture);`;
class Recorder{
 constructor({media=root.navigator?.mediaDevices,Context=root.AudioContext||root.webkitAudioContext,onState=()=>{},onDone=()=>{},onError=()=>{}}={}){this.media=media;this.Context=Context;this.onState=onState;this.onDone=onDone;this.onError=onError;this.epoch=0;this.state='idle';this.closed=false;}
 stateTo(value){this.state=value;this.onState(value);}
 async list(){
  if(this.closed||this.state!=='idle')throw Error('录音操作尚未结束');if(!this.media?.getUserMedia||!this.media?.enumerateDevices)throw Error('此浏览器不支持录音设备选择');
  const epoch=++this.epoch;this.stateTo('listing');let probe;
  try{probe=await this.media.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});for(const t of probe.getTracks())t.stop();if(epoch!==this.epoch||this.closed)return null;const devices=await this.media.enumerateDevices();if(epoch!==this.epoch||this.closed)return null;return devices.filter(x=>x.kind==='audioinput'&&x.deviceId&&x.deviceId!=='default'&&x.deviceId!=='communications').map((x,i)=>({id:x.deviceId,label:x.label||'录音输入 '+(i+1)}));}
  finally{if(probe)for(const t of probe.getTracks())t.stop();if(epoch===this.epoch&&!this.closed)this.stateTo('idle');}
 }
 async start(deviceId,seconds){
  if(this.closed||this.state!=='idle')throw Error('录音操作尚未结束');if(!deviceId)throw Error('请明确选择录音输入');if(!Number.isFinite(seconds)||seconds<1||seconds>30)throw Error('录音时长应为1–30秒');if(!this.media?.getUserMedia||!this.Context)throw Error('此浏览器不支持PCM录音');
  const epoch=++this.epoch;this.stateTo('starting');let stream,ctx;
  try{
   stream=await this.media.getUserMedia({audio:{deviceId:{exact:deviceId},channelCount:{ideal:2},echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
   if(epoch!==this.epoch||this.closed){stream.getTracks().forEach(t=>t.stop());return;}
   this.stream=stream;ctx=new this.Context({sampleRate:48000});this.ctx=ctx;await ctx.resume();if(epoch!==this.epoch||this.closed)return;
   this.chunks=[];this.frames=0;this.channelCount=0;this.limit=Math.floor(ctx.sampleRate*seconds);this.settings=stream.getAudioTracks()[0]?.getSettings?.()||{};
   if(['echoCancellation','noiseSuppression','autoGainControl'].some(k=>this.settings[k]===true))throw Error('浏览器仍启用了语音处理，已停止测量录音；请关闭回声消除、降噪和自动增益后重试');
   this.source=ctx.createMediaStreamSource(stream);this.silent=ctx.createGain();this.silent.gain.value=0;this.silent.connect(ctx.destination);
   const receive=data=>{if(epoch!==this.epoch||this.state!=='recording')return;try{this.append(data);}catch(e){this.stop(false);this.onError(e);}};
   if(ctx.audioWorklet&&root.AudioWorkletNode){
    const url=root.URL.createObjectURL(new Blob([workletSource],{type:'text/javascript'}));
    try{await ctx.audioWorklet.addModule(url);}finally{root.URL.revokeObjectURL(url);}
    if(epoch!==this.epoch||this.closed)return;
    this.processor=new root.AudioWorkletNode(ctx,'ac10x-pcm-capture',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});this.processor.port.onmessage=e=>receive(e.data);this.processor.onprocessorerror=()=>{if(epoch===this.epoch){this.stop(false);this.onError(Error('录音工作线程中断，未完整的录音已丢弃'));}};this.engine='AudioWorklet';
   }else{
    this.processor=ctx.createScriptProcessor(4096,2,1);this.processor.onaudioprocess=e=>receive(Array.from({length:Math.min(2,e.inputBuffer.numberOfChannels)},(_,i)=>e.inputBuffer.getChannelData(i)));this.engine='主线程兼容采集';
   }
   this.source.connect(this.processor);this.processor.connect(this.silent);this.stateTo('recording');
   for(const track of stream.getTracks())track.addEventListener?.('ended',()=>{if(epoch===this.epoch){this.stop(false);this.onError(Error('录音设备已断开，未完整的录音已丢弃'));}},{once:true});
   for(const track of stream.getTracks())track.addEventListener?.('mute',()=>{if(epoch===this.epoch&&this.state==='recording'){this.stop(false);this.onError(Error('录音输入被暂停，未完整的录音已丢弃；请检查系统音效和设备状态'));}},{once:true});
   this.timer=setTimeout(()=>{if(epoch===this.epoch){this.stop(false);this.onError(Error('录音未按期收到足够样本，未完整的录音已丢弃'));}},(seconds+3)*1000);
  }catch(e){if(epoch===this.epoch){this.stop(false);throw e;}}
  finally{if(epoch!==this.epoch){stream?.getTracks().forEach(t=>t.stop());if(ctx&&ctx.state!=='closed')await ctx.close().catch(()=>{});}}
 }
 append(channels){
  if(!channels?.length)return;const count=Math.min(channels.length,2),n=Math.min(channels[0].length,this.limit-this.frames);if(n<=0)return;
  if(this.channelCount&&this.channelCount!==count)throw Error('采集中通道数改变');this.channelCount=count;
  if(!channels.slice(0,count).every(ch=>ch.length>=n))throw Error('录音通道长度不一致');
  this.chunks.push(channels.slice(0,count).map(ch=>Float32Array.from(ch.subarray(0,n))));this.frames+=n;
  if(this.frames>=this.limit)this.stop(true);
 }
 stop(save=true){
  const hadRecording=this.state==='recording';++this.epoch;clearTimeout(this.timer);this.timer=null;
  const ctx=this.ctx,stream=this.stream;this.ctx=null;this.stream=null;
  if(this.processor?.port)this.processor.port.onmessage=null;if(this.processor){this.processor.onaudioprocess=null;this.processor.onprocessorerror=null;}
  for(const node of [this.source,this.processor,this.silent]){try{node?.disconnect();}catch{}}
  this.source=this.processor=this.silent=null;stream?.getTracks().forEach(t=>t.stop());if(ctx&&ctx.state!=='closed')ctx.close().catch(()=>{});
  const frames=this.frames||0,channels=[];
  if(save&&hadRecording&&frames){for(let ch=0;ch<this.channelCount;ch++){const a=new Float32Array(frames);let n=0;for(const block of this.chunks){a.set(block[ch],n);n+=block[ch].length;}channels.push(a);}}
  this.chunks=[];this.frames=0;if(!this.closed)this.stateTo('idle');
  if(channels.length)this.onDone({channels,sampleRate:ctx.sampleRate,seconds:frames/ctx.sampleRate,engine:this.engine,settings:{echoCancellation:this.settings.echoCancellation,noiseSuppression:this.settings.noiseSuppression,autoGainControl:this.settings.autoGainControl,sampleRate:this.settings.sampleRate}});
 }
 close(){this.closed=true;this.stop(false);this.state='closed';}
}
const api={Recorder,workletSource};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AudioCapture=api;
})(typeof globalThis!=='undefined'?globalThis:this);
