/* AC10x Audio Lab — browser-independent signal calculations. */
(function (root) {
  'use strict';
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  function biquad(type, frequency, gain, q, fs) {
    if (![frequency, gain, q, fs].every(Number.isFinite) || frequency <= 0 || frequency >= fs / 2 || q <= 0) throw new Error('滤波器参数超出有效范围');
    const A = Math.pow(10, gain / 40), w = 2 * Math.PI * frequency / fs;
    const c = Math.cos(w), s = Math.sin(w), alpha = s / (2 * q), beta = 2 * Math.sqrt(A) * alpha;
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'peaking': b0=1+alpha*A; b1=-2*c; b2=1-alpha*A; a0=1+alpha/A; a1=-2*c; a2=1-alpha/A; break;
      case 'lowshelf': b0=A*((A+1)-(A-1)*c+beta); b1=2*A*((A-1)-(A+1)*c); b2=A*((A+1)-(A-1)*c-beta); a0=(A+1)+(A-1)*c+beta; a1=-2*((A-1)+(A+1)*c); a2=(A+1)+(A-1)*c-beta; break;
      case 'highshelf': b0=A*((A+1)+(A-1)*c+beta); b1=-2*A*((A-1)+(A+1)*c); b2=A*((A+1)+(A-1)*c-beta); a0=(A+1)-(A-1)*c+beta; a1=2*((A-1)-(A+1)*c); a2=(A+1)-(A-1)*c-beta; break;
      case 'lowpass': b0=(1-c)/2; b1=1-c; b2=(1-c)/2; a0=1+alpha; a1=-2*c; a2=1-alpha; break;
      case 'highpass': b0=(1+c)/2; b1=-(1+c); b2=(1+c)/2; a0=1+alpha; a1=-2*c; a2=1-alpha; break;
      default: throw new Error('未知滤波器类型');
    }
    return [b0/a0,b1/a0,b2/a0,a1/a0,a2/a0];
  }
  function response(coeff, f, fs) {
    const [b0,b1,b2,a1,a2]=coeff, w=2*Math.PI*f/fs;
    const nr=b0+b1*Math.cos(w)+b2*Math.cos(2*w), ni=-b1*Math.sin(w)-b2*Math.sin(2*w);
    const dr=1+a1*Math.cos(w)+a2*Math.cos(2*w), di=-a1*Math.sin(w)-a2*Math.sin(2*w);
    return 10*Math.log10(Math.max(1e-20,(nr*nr+ni*ni)/(dr*dr+di*di)));
  }
  const coefficients = (band, fs) => biquad(band.type,band.freq,band.gain,band.q,fs);
  function cascadeDb(bands, f, fs, preGain=0, enabled=true) {
    return enabled ? bands.filter(b=>b.enabled).reduce((v,b)=>v+response(coefficients(b,fs),f,fs),preGain) : 0;
  }
  function quantize(coeff) { return coeff.map(n=>Math.round(n*65536)); }
  function stable(coeff) { const [, , , a1,a2]=coeff; return Math.abs(a2)<1 && 1+a1+a2>0 && 1-a1+a2>0; }
  function processSamples(input, bands, fs, preGain=0, enabled=true) {
    let out=Float32Array.from(input);
    if (!enabled) return out;
    const gain=Math.pow(10,preGain/20); for(let i=0;i<out.length;i++) out[i]*=gain;
    bands.filter(b=>b.enabled).forEach(b=>{
      const [b0,b1,b2,a1,a2]=coefficients(b,fs); let x1=0,x2=0,y1=0,y2=0;
      for(let i=0;i<out.length;i++) { const x=out[i],y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2; out[i]=y; x2=x1;x1=x;y2=y1;y1=y; }
    });
    return out;
  }
  function fftDb(input,n=2048) {
    const re=new Float64Array(n),im=new Float64Array(n); let sum=0;
    for(let i=0;i<n;i++){const w=.5-.5*Math.cos(2*Math.PI*i/(n-1)); re[i]=(input[i]||0)*w;sum+=w;}
    for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
    for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len;for(let i=0;i<n;i+=len){for(let j=0;j<len/2;j++){const c=Math.cos(a*j),s=Math.sin(a*j),k=i+j,h=k+len/2,tr=re[h]*c-im[h]*s,ti=re[h]*s+im[h]*c;re[h]=re[k]-tr;im[h]=im[k]-ti;re[k]+=tr;im[k]+=ti;}}}
    return Array.from({length:n/2},(_,i)=>20*Math.log10(Math.max(1e-9,Math.hypot(re[i],im[i])*(i===0?1:2)/sum)));
  }
  function stats(samples) { let peak=0,sum=0,clipped=0;for(const v of samples){peak=Math.max(peak,Math.abs(v));sum+=v*v;if(Math.abs(v)>=1)clipped++;}return{peakDb:20*Math.log10(Math.max(1e-9,peak)),rmsDb:10*Math.log10(Math.max(1e-18,sum/Math.max(1,samples.length))),clipped}; }
  function wav(channels,fs) {
    const len=channels[0].length,n=channels.length,buf=new ArrayBuffer(44+len*n*2),v=new DataView(buf);
    function str(off,s){for(let i=0;i<s.length;i++)v.setUint8(off+i,s.charCodeAt(i));}
    str(0,'RIFF');v.setUint32(4,buf.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,n,true);v.setUint32(24,fs,true);v.setUint32(28,fs*n*2,true);v.setUint16(32,n*2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,len*n*2,true);
    let off=44;for(let i=0;i<len;i++)for(let ch=0;ch<n;ch++){const x=clamp(channels[ch][i],-1,1);v.setInt16(off,Math.round(x*(x<0?32768:32767)),true);off+=2;}
    return buf;
  }
  const api={clamp,biquad,response,coefficients,cascadeDb,quantize,stable,processSamples,fftDb,stats,wav};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AudioDSP=api;
})(typeof globalThis!=='undefined'?globalThis:this);
