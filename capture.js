/* Bounded browser PCM capture. Explicit permission and exact selected input; no monitor audio. */
(function(root){
'use strict';
const workletSource=`class AC10xCapture extends AudioWorkletProcessor {
 process(inputs,outputs){ const channels=inputs[0]||[];if(channels.length){const data=channels.slice(0,2).map(ch=>Float32Array.from(ch));this.port.postMessage(data,data.map(ch=>ch.buffer));}for(const out of outputs)for(const ch of out)ch.fill(0);return true; }
} registerProcessor('ac10x-pcm-capture',AC10xCapture);`;
class Recorder{
 constructor({media=root.navigator?.mediaDevices,Context=root.AudioContext||root.webkitAudioContext,PCMRecorder=root.MediaRecorder,OfflineContext=root.OfflineAudioContext||root.webkitOfflineAudioContext,onState=()=>{},onDone=()=>{},onError=()=>{}}={}){this.media=media;this.Context=Context;this.PCMRecorder=PCMRecorder;this.OfflineContext=OfflineContext;this.onState=onState;this.onDone=onDone;this.onError=onError;this.epoch=0;this.state='idle';this.closed=false;}
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
   this.stream=stream;this.settings=stream.getAudioTracks()[0]?.getSettings?.()||{};
   if(['echoCancellation','noiseSuppression','autoGainControl'].some(k=>this.settings[k]===true))throw Error('浏览器仍启用了语音处理，已停止测量录音；请关闭回声消除、降噪和自动增益后重试');
   for(const track of stream.getTracks())track.addEventListener?.('ended',()=>{if(epoch===this.epoch){this.stop(false);this.onError(Error('录音设备已断开，未完整的录音已丢弃'));}},{once:true});
   for(const track of stream.getTracks())track.addEventListener?.('mute',()=>{if(epoch===this.epoch&&this.state==='recording'){this.stop(false);this.onError(Error('录音输入被暂停，未完整的录音已丢弃；请检查系统音效和设备状态'));}},{once:true});
   // WebM PCM is lossless float32 and follows the input track's clock. No Opus fallback.
   if(this.OfflineContext&&this.PCMRecorder?.isTypeSupported?.('audio/webm;codecs=pcm')){this.startPCM(stream,seconds,epoch);return;}
   ctx=new this.Context({sampleRate:48000});this.ctx=ctx;await ctx.resume();if(epoch!==this.epoch||this.closed)return;
   this.chunks=[];this.frames=0;this.channelCount=0;this.limit=Math.floor(ctx.sampleRate*seconds);
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
   this.timer=setTimeout(()=>{if(epoch===this.epoch){this.stop(false);this.onError(Error('录音未按期收到足够样本，未完整的录音已丢弃'));}},(seconds+3)*1000);
  }catch(e){if(epoch===this.epoch){this.stop(false);throw e;}}
  finally{if(epoch!==this.epoch){stream?.getTracks().forEach(t=>t.stop());if(ctx&&ctx.state!=='closed')await ctx.close().catch(()=>{});}}
 }
 startPCM(stream,seconds,epoch){
  const recorder=new this.PCMRecorder(stream,{mimeType:'audio/webm;codecs=pcm'});
  if(!/codecs\s*=\s*pcm(?:\s|;|$)/i.test(recorder.mimeType))throw Error('浏览器未提供无损 PCM 录音，已停止');
  this.pcm=recorder;this.pcmChunks=[];this.pcmBytes=0;this.pcmSeconds=seconds;this.pcmComplete=false;this.engine='MediaRecorder PCM';
  const fail=error=>{if(epoch===this.epoch){this.stop(false);this.onError(error);}};
  recorder.ondataavailable=e=>{if(epoch!==this.epoch||!e.data?.size)return;this.pcmBytes+=e.data.size;if(this.pcmBytes>(seconds+2)*48000*2*4+65536){fail(Error('录音数据超过时长上限，已停止'));return;}this.pcmChunks.push(e.data);};
  recorder.onerror=()=>fail(Error('无损 PCM 录音中断，未完整的录音已丢弃'));
  recorder.onstart=()=>{if(epoch!==this.epoch)return;this.stateTo('recording');clearTimeout(this.timer);this.timer=setTimeout(()=>{if(epoch===this.epoch){this.pcmComplete=true;this.stop(true);}},(seconds+.15)*1000);};
  recorder.onstop=()=>this.finishPCM(epoch);
  this.timer=setTimeout(()=>fail(Error('声卡录音启动超时')),5000);
  recorder.start(250);
 }
 async finishPCM(epoch){
  if(epoch!==this.epoch||this.closed||this.state!=='processing')return;
  const chunks=this.pcmChunks,seconds=this.pcmSeconds,complete=this.pcmComplete;this.pcmChunks=[];
  const recorder=this.pcm;this.pcm=null;if(recorder)recorder.ondataavailable=recorder.onstop=recorder.onerror=recorder.onstart=null;
  clearTimeout(this.timer);this.timer=setTimeout(()=>{if(epoch===this.epoch){this.stop(false);this.onError(Error('原始 PCM 整理超时，未替换上一段录音'));}},10000);
  try{
   if(!chunks.length)throw Error('未收到原始 PCM 录音数据');
   const bytes=await new Blob(chunks,{type:'audio/webm;codecs=pcm'}).arrayBuffer();if(epoch!==this.epoch||this.closed)return;
   const decoder=new this.OfflineContext(2,1,48000),buffer=await decoder.decodeAudioData(bytes);if(epoch!==this.epoch||this.closed)return;
   if(buffer.sampleRate!==48000||buffer.numberOfChannels<1||buffer.numberOfChannels>2)throw Error('原始 PCM 的采样率或通道数不受支持');
   const frames=Math.min(buffer.length,Math.floor(48000*seconds));if(!frames||complete&&frames<48000*seconds)throw Error('录音样本不足，未替换上一段录音');
   const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>Float32Array.from(buffer.getChannelData(i).subarray(0,frames)));
   clearTimeout(this.timer);this.timer=null;++this.epoch;this.stateTo('idle');this.done(channels,48000);
  }catch(error){if(epoch===this.epoch){this.stop(false);this.onError(error);}}
 }
 done(channels,sampleRate){this.onDone({channels,sampleRate,seconds:channels[0].length/sampleRate,engine:this.engine,settings:{echoCancellation:this.settings.echoCancellation,noiseSuppression:this.settings.noiseSuppression,autoGainControl:this.settings.autoGainControl,sampleRate:this.settings.sampleRate}});}
 append(channels){
  if(!channels?.length)return;const count=Math.min(channels.length,2),n=Math.min(channels[0].length,this.limit-this.frames);if(n<=0)return;
  if(this.channelCount&&this.channelCount!==count)throw Error('采集中通道数改变');this.channelCount=count;
  if(!channels.slice(0,count).every(ch=>ch.length>=n))throw Error('录音通道长度不一致');
  this.chunks.push(channels.slice(0,count).map(ch=>Float32Array.from(ch.subarray(0,n))));this.frames+=n;
  if(this.frames>=this.limit)this.stop(true);
 }
 stop(save=true){
  if(this.pcm){
   const recorder=this.pcm;
   if(save&&this.state==='recording'){
    clearTimeout(this.timer);this.stateTo('processing');this.timer=setTimeout(()=>{this.stop(false);this.onError(Error('无损 PCM 录音停止超时'));},5000);
    try{recorder.stop();}catch(error){this.stop(false);this.onError(error);return;}
    this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;return;
   }
   ++this.epoch;recorder.ondataavailable=recorder.onstop=recorder.onerror=recorder.onstart=null;
   if(recorder.state!=='inactive')try{recorder.stop();}catch{}this.pcm=null;this.pcmChunks=[];
  }
  const hadRecording=this.state==='recording';++this.epoch;clearTimeout(this.timer);this.timer=null;
  const ctx=this.ctx,stream=this.stream;this.ctx=null;this.stream=null;
  if(this.processor?.port)this.processor.port.onmessage=null;if(this.processor){this.processor.onaudioprocess=null;this.processor.onprocessorerror=null;}
  for(const node of [this.source,this.processor,this.silent]){try{node?.disconnect();}catch{}}
  this.source=this.processor=this.silent=null;stream?.getTracks().forEach(t=>t.stop());if(ctx&&ctx.state!=='closed')ctx.close().catch(()=>{});
  const frames=this.frames||0,channels=[];
  if(save&&hadRecording&&frames){for(let ch=0;ch<this.channelCount;ch++){const a=new Float32Array(frames);let n=0;for(const block of this.chunks){a.set(block[ch],n);n+=block[ch].length;}channels.push(a);}}
  this.chunks=[];this.frames=0;if(!this.closed)this.stateTo('idle');
  if(channels.length)this.done(channels,ctx.sampleRate);
 }
 close(){this.closed=true;this.stop(false);this.state='closed';}
}
const api={Recorder,workletSource};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AudioCapture=api;
})(typeof globalThis!=='undefined'?globalThis:this);
