/* QA-only preload: native devices/audio/network are unreachable. */
(()=>{
 const q={nativeAttempts:{},chooserCalls:0,listeners:new Set(),pending:[],hold:'none',fault:'none',device:null,axeReports:[],mediaMode:'blocked',fixtureTracks:0,fixtureAudioContexts:0,fixtureSources:0};
 const deny=name=>{q.nativeAttempts[name]=(q.nativeAttempts[name]||0)+1;throw Error('QA blocked native '+name);};
 const set=(obj,key,value)=>Object.defineProperty(obj,key,{value,writable:false,configurable:false});
 set(navigator,'hid',Object.freeze({async requestDevice(){q.chooserCalls++;if(!q.device)throw Error('QA fake device unavailable');return[q.device];},async getDevices(){return q.device?[q.device]:[];},addEventListener(name,fn){if(name==='disconnect')q.listeners.add(fn);},removeEventListener(name,fn){q.listeners.delete(fn);}}));
 for(const kind of ['usb','serial'])set(navigator,kind,Object.freeze({requestDevice:async()=>deny(kind),requestPort:async()=>deny(kind),getDevices:async()=>deny(kind),getPorts:async()=>deny(kind),addEventListener(){},removeEventListener(){}}));
 set(navigator,'mediaDevices',Object.freeze({async getUserMedia(){if(q.mediaMode!=='fake')throw new DOMException('QA simulated permission denied','NotAllowedError');q.fixtureTracks++;let stopped=false;const track={stop(){if(!stopped){stopped=true;q.fixtureTracks--; }},addEventListener(){},getSettings(){return{sampleRate:48000,echoCancellation:false,noiseSuppression:false,autoGainControl:false};}};return{getTracks:()=>[track],getAudioTracks:()=>[track]};},async enumerateDevices(){return q.mediaMode==='fake'?[{kind:'audioinput',deviceId:'qa-input',label:'QA GENERATED PCM — NOT A MICROPHONE'}]:[];},getDisplayMedia:async()=>deny('screen-capture'),addEventListener(){},removeEventListener(){}}));
 class FakeContext{
  constructor(){if(q.mediaMode!=='fake')throw Error('QA audio simulation disabled');q.fixtureAudioContexts++;q.context=this;this.sampleRate=48000;this.currentTime=0;this.state='running';this.destination=this.node();}
  node(){return{connect(){},disconnect(){}};}
  async resume(){}async close(){if(this.state!=='closed'){this.state='closed';q.fixtureAudioContexts--;}}
  createMediaStreamSource(){return this.node();}createGain(){const n=this.node();n.gain={value:1,setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(){}};return n;}
  createScriptProcessor(){this.processor=this.node();return this.processor;}
  createBuffer(channels,length,rate){const data=Array.from({length:channels},()=>new Float32Array(length));return{duration:length/rate,copyToChannel(v,i){data[i].set(v);},getChannelData:i=>data[i]};}
  createBufferSource(){const n=this.node();let active=false;const stop=()=>{clearTimeout(n.timer);if(active){active=false;q.fixtureSources--;}};n.start=()=>{active=true;q.fixtureSources++;n.timer=setTimeout(()=>{stop();n.onended?.();},Math.max(1,(n.buffer?.duration||1)*1000));};n.stop=stop;return n;}
 }
 for(const key of ['AudioContext','webkitAudioContext'])set(window,key,FakeContext);
 set(window,'OfflineAudioContext',class{constructor(){deny('OfflineAudioContext');}});
 set(HTMLMediaElement.prototype,'play',async()=>deny('media-play'));
 set(window,'fetch',async()=>deny('fetch'));set(navigator,'sendBeacon',()=>deny('beacon'));
 for(const key of ['WebSocket','XMLHttpRequest','RTCPeerConnection','EventSource'])set(window,key,class{constructor(){deny(key);}});
 set(window,'QualityQA',q);
})();
