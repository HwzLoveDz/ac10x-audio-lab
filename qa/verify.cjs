const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../dsp.js');
let tests=0;
function check(name,fn){fn();tests++;console.log('PASS '+name);}
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
check('peaking with zero gain is unity across the spectrum',()=>{const c=D.biquad('peaking',1700,0,.8,48000);[20,500,1700,10000,20000].forEach(f=>near(D.response(c,f,48000),0));});
check('peaking reaches requested gain at its center',()=>{for(const fs of [8000,44100,48000])for(const g of [-12,6,15])near(D.response(D.biquad('peaking',1000,g,1,fs),1000,fs),g);});
check('Butterworth LP and HP have -3.0103 dB at cutoff',()=>{for(const t of ['lowpass','highpass'])near(D.response(D.biquad(t,500,0,Math.SQRT1_2,48000),500,48000),-3.01029995664);});
check('shelf asymptotes preserve passband and requested shelf gain',()=>{const lo=D.biquad('lowshelf',500,6,Math.SQRT1_2,48000),hi=D.biquad('highshelf',500,6,Math.SQRT1_2,48000);near(D.response(lo,.001,48000),6,.001);near(D.response(lo,23999,48000),0,.001);near(D.response(hi,.001,48000),0,.001);near(D.response(hi,23999,48000),6,.001);});
check('invalid Nyquist and Q rejected',()=>{assert.throws(()=>D.biquad('peaking',24000,0,1,48000));assert.throws(()=>D.biquad('peaking',1000,0,0,48000));});
check('audio processing agrees with analytical gain independently',()=>{const fs=48000,f=1000,n=fs,data=Float32Array.from({length:n},(_,i)=>.05*Math.sin(2*Math.PI*f*i/fs));const out=D.processSamples(data,[{enabled:true,type:'peaking',freq:f,gain:6,q:1}],fs,0,true);let a=0,b=0;for(let i=10000;i<n;i++){a+=data[i]**2;b+=out[i]**2;}near(10*Math.log10(b/a),6,.01);assert.deepEqual(D.processSamples(data,[],fs,0,false),data);});
check('Hann FFT recovers coherent sine frequency and amplitude',()=>{const fs=48000,n=2048,bin=64,amp=.125,data=Float32Array.from({length:n},(_,i)=>amp*Math.sin(2*Math.PI*bin*i/n)),s=D.fftDb(data,n);assert.equal(s.indexOf(Math.max(...s)),bin);near(s[bin],20*Math.log10(amp),.01);});
check('signed fixed point roundtrip and stability',()=>{const c=D.biquad('peaking',1000,6,1,48000),q=D.quantize(c);q.forEach((v,i)=>{const packed=v&0xffffff,unpacked=(packed<<8)>>8;assert.equal(unpacked,v);near(v/65536,c[i],1/65536);});assert.ok(D.stable(q.map(v=>v/65536)));assert.ok(!D.stable([1,0,0,0,1.1]));});
check('PCM WAV header and signed saturation',()=>{const b=D.wav([new Float32Array([-2,-1,0,1,2])],48000),v=new DataView(b);assert.equal(b.byteLength,54);assert.equal(v.getUint32(24,true),48000);assert.equal(v.getUint16(22,true),1);assert.equal(v.getInt16(44,true),-32768);assert.equal(v.getInt16(52,true),32767);});
check('local editor does not send reports or make network requests',()=>{const js=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');assert.ok(!/\.sendReport\s*\(/.test(js));assert.ok(!/\.sendFeatureReport\s*\(/.test(js));assert.ok(!/fetch\s*\(/.test(js));});
check('standalone bundle retains all 15 exact scripts without obsolete guide and valid syntax',()=>{const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'AC10x-Audio-Lab.html'),'utf8'),scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.equal(scripts.length,15);['dsp.js','routing.js','transport.js','codec.js','debug.js','examples.js','session.js','legacy.js','capture.js','viewport.js','locale-catalog.js','i18n.js','app.js','hardware.js','usability.js'].forEach((name,i)=>{assert.equal(scripts[i][1],fs.readFileSync(path.join(root,name),'utf8'));new (require('node:vm').Script)(scripts[i][1]);});assert.ok(!/<script src=|<link rel="stylesheet"/.test(html));});
console.log(`${tests} meaningful checks passed`);
