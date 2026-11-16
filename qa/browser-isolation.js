/* QA-only preload: real devices, capture, playback and outbound traffic are unreachable. */
(() => {
  const calls = {}, errors = [];
  const deny = name => { calls[name] = (calls[name] || 0) + 1; throw new Error('QA isolated: ' + name); };
  const reject = name => async () => deny(name);
  const install = (object, name, value) => Object.defineProperty(object, name, {value, configurable:false, writable:false});
  for (const kind of ['hid','usb','serial']) install(navigator, kind, Object.freeze({
    requestDevice:reject(kind),requestPort:reject(kind),getDevices:reject(kind),getPorts:reject(kind),
    addEventListener(){},removeEventListener(){}
  }));
  install(navigator,'mediaDevices',Object.freeze({getUserMedia:reject('media'),getDisplayMedia:reject('display'),enumerateDevices:reject('enumerate'),addEventListener(){},removeEventListener(){}}));
  for(const name of ['AudioContext','webkitAudioContext','OfflineAudioContext','webkitOfflineAudioContext'])install(window,name,class {constructor(){deny(name);}});
  for(const name of ['play','captureStream','mozCaptureStream'])install(HTMLMediaElement.prototype,name,reject('HTMLMediaElement.'+name));
  install(window,'fetch',reject('fetch'));
  install(navigator,'sendBeacon',()=>deny('beacon'));
  for(const name of ['WebSocket','EventSource','RTCPeerConnection','XMLHttpRequest'])install(window,name,class {constructor(){deny(name);}});
  addEventListener('error',e=>errors.push(e.message));
  addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
  const fileReads={delay:false,pending:[]},readFile=File.prototype.text;
  install(File.prototype,'text',function(){const reading=readFile.call(this);return fileReads.delay?reading.then(text=>new Promise(resolve=>fileReads.pending.push(()=>resolve(text)))):reading;});
  install(window,'QAIsolation',Object.freeze({calls,errors,fileReads,installed:true}));
})();
