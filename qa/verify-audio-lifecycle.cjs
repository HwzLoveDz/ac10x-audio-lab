const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
let checks=0;
const sleep=()=>new Promise(r=>setTimeout(r,10));
function setup(){
 const errors=[],contexts=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 class Context{
  constructor(){this.state='suspended';this.resumes=[];this.decodes=[];this.sources=[];this.currentTime=0;contexts.push(this);}
  resume(){return new Promise(r=>this.resumes.push(()=>{this.state='running';r();}));}
  release(){this.resumes.splice(0).forEach(r=>r());}
  close(){this.state='closed';return Promise.resolve();}
  createBuffer(c,n,fs){return{duration:n/fs,copyToChannel(){}};}
  createBufferSource(){const s={connect(){},disconnect(){s.disconnected=true;},start(){s.started=true;},stop(){s.stopped=true;}};this.sources.push(s);return s;}
  createGain(){return{connect(){},disconnect(){},gain:{setValueAtTime(){},linearRampToValueAtTime(){}}};}
  decodeAudioData(){return new Promise(r=>this.decodes.push(r));}
 }
 const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../AC10x-Audio-Lab.html'),'utf8'),{url:'https://qa.invalid/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.scrollTo=()=>{};w.AudioContext=Context;}});
 const w=dom.window,$=s=>w.document.querySelector(s);
 return{w,$,contexts,errors,close(){w.dispatchEvent(new w.Event('pagehide'));w.close();}};
}
function pass(name){checks++;console.log('PASS '+name);}
(async()=>{
 let x=setup();try{
  x.$('#playAudio').click();const ctx=x.contexts[0];x.$('#stopAudio').click();ctx.release();await sleep();assert.equal(ctx.sources.length,0);
  pass('stop during asynchronous audio activation prevents later playback');
  ctx.state='suspended';x.$('#playAudio').click();x.$('#playAudio').click();ctx.release();await sleep();assert.equal(ctx.sources.length,1);assert.equal(ctx.sources[0].started,true);
  x.$('#stopAudio').click();assert.equal(ctx.sources[0].stopped,true);assert.equal(ctx.sources[0].disconnected,true);
  pass('rapid play actions produce one active source and stop disconnects it');assert.deepEqual(x.errors,[]);
 }finally{x.close();}
 x=setup();try{
  const file=x.$('#audioFile');function load(name){Object.defineProperty(file,'files',{configurable:true,value:[{name,size:8,arrayBuffer:async()=>new ArrayBuffer(8)}]});file.dispatchEvent(new x.w.Event('change'));}
  load('old.wav');const ctx=x.contexts[0];ctx.release();await sleep();assert.equal(ctx.decodes.length,1);
  load('new.wav');await sleep();assert.equal(ctx.decodes.length,2);
  const buffer={sampleRate:48000,length:2048,numberOfChannels:1,duration:2048/48000,getChannelData:()=>new Float32Array(2048)};
  ctx.decodes[1](buffer);await sleep();ctx.decodes[0](buffer);await sleep();assert.equal(x.$('#audioSourceName').textContent,'new.wav');
  pass('out-of-order audio decode cannot replace the newer imported file');
  load('cancelled.wav');await sleep();x.$('#stopAudio').click();ctx.decodes[2](buffer);await sleep();assert.equal(x.$('#audioSourceName').textContent,'new.wav');
  pass('stop also cancels pending audio import completion');assert.deepEqual(x.errors,[]);
 }finally{x.close();}
 console.log(checks+' audio lifecycle checks passed; synthetic audio API, no sound output');
})().catch(e=>{console.error(e);process.exitCode=1;});
