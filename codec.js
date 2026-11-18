/* AC102 register codec. Facts reconciled with vendor manual, driver and GUI.
 * This module emits masked patches, never a zero-filled hardware initializer. */
(function(root){
  'use strict';
  const D=typeof module!=='undefined'&&module.exports?require('./dsp.js'):root.AudioDSP;
  const R=typeof module!=='undefined'&&module.exports?require('./routing.js'):root.AudioRouting;
  const T=typeof module!=='undefined'&&module.exports?require('./transport.js'):root.AudioHardwareTransport;
  const ADC_DIV=[1,2,3,4,6,8,12,16,24],BCLK_DIV=[1,2,4,6,8,12,16,24,32,48,64,96,128,176,192],FS=[8000,11025,12000,16000,22050,24000,32000,44100,48000];
  const READ_ADDRESSES=[...Array.from({length:16},(_,i)=>i),17,19,22,24,25,26,27,28,29,31,...Array.from({length:9},(_,i)=>0x20+i),...Array.from({length:23},(_,i)=>0x30+i),0x4f,...[0x50,0x60,0x70].flatMap(a=>Array.from({length:15},(_,i)=>a+i))];
  const masks={2:4,3:0x37,4:15,5:15,6:63,7:0xd7,8:63,9:0x13,10:255,11:0x37,12:0x77,13:0xef,14:15,15:15,17:15,19:255,22:255,24:15,25:0xbf,26:255,27:0x4f,28:255,29:15,31:63,32:0xf9,33:0xff,34:255,35:255,36:255,37:0xfc,38:0x2f,39:0xfe,40:0xff,49:31,50:255,51:63,52:255,53:7,54:255,55:255,56:255,57:255,58:255,59:255,60:255,61:31,62:7,63:255,64:255,65:255,66:7,67:255,68:255,69:255,70:31,79:1};
  for(const base of [0x50,0x60,0x70])for(let i=0;i<15;i++)masks[base+i]=i%3===0?7:255;
  // A clicked module owns only these bits. Other draft modules cannot leak into its write.
  const NODE_MASKS={bias:{2:4},input:{25:0x81,3:0x10,32:1,6:3},pga:{32:0xf8},adc:{3:0x10,25:1,32:1,6:3},
    hpf:{3:4,6:2,49:8,66:7,67:255,68:255,69:255},agc:{3:4,6:2,49:0x14,50:255,51:63,52:255,57:255,58:255,59:255,60:255,61:31},
    adcvol:{26:255},dacvol:{28:255},rec:{19:5,29:2},rxm:{29:1,19:8,25:0x30},play:{19:2},rxmix:{24:15},dacmix:{29:15},txl:{19:0x33},txr:{19:0xcc},rxmap:{22:255},txmap:{17:15},rx:{7:3},tx:{7:0x15},dac:{3:0x21,27:1,6:12},lineamp:{38:0x2f},adcdebug:{25:0x30},dacdebug:{27:6}};
  for(const id of ['source','dmic','dmicport'])NODE_MASKS[id]=NODE_MASKS.input;
  NODE_MASKS.output=NODE_MASKS.lineamp;
  function clone(x){return JSON.parse(JSON.stringify(x));}
  function normalize(c){if(c.agc.noiseDebounce===undefined)c.agc.noiseDebounce=170.6667;if(c.agc.noiseDetect===undefined)c.agc.noiseDetect=true;for(const k of ['adc','dac'])if(c[k].mute===undefined)c[k].mute=false;return c;}
  function hpf(f,fs){if(!(f>0&&f<fs/2))throw new Error('HPF 频率必须小于 Nyquist 频率');const t=Math.tan(Math.PI*f/fs),a=(1-t)/(1+t);return{a,coefficients:[1,-1,0,-a,0],fixed:Math.trunc(a*16777216)};}
  function s19(v){v&=0x7ffff;return v&0x40000?v-0x80000:v;}
  function eqCoefficients(c,{checkStability=true,checkRange=true}={}){return c.eq.bands.map((band,i)=>{let values=(!band.enabled||(['peaking','lowshelf','highshelf'].includes(band.type)&&band.gain===0))?[1,0,0,0,0]:D.coefficients(band,c.clock.fs);values=[...values];if(i===0){const g=Math.pow(10,c.eq.preGain/20);for(let j=0;j<3;j++)values[j]*=g;}const fixed=values.map(v=>Math.trunc(v*65536)),inRange=fixed.every(v=>v>=-262144&&v<=262143);if(checkRange&&!inRange)throw new Error('第 '+(i+1)+' 段 EQ 系数超出 3.16 有符号范围 [-4, 4)，请降低增益');if(checkStability&&!D.stable(fixed.map(v=>v/65536)))throw new Error('第 '+(i+1)+' 段 EQ 量化后不稳定，请提高频率或降低 Q');return{values,fixed,inRange};});}
  function debounce(ms,fs){if(ms===0)return{value:0,actualMs:0};if(!Number.isFinite(ms)||ms<0)throw new Error('消抖时间无效');const value=Math.max(1,Math.min(15,Math.round(Math.log2(ms*fs/1000)-1)));return{value,actualMs:Math.pow(2,value+1)/fs*1000};}
  function ticks(ms,fs,name){const n=Math.round(ms*fs/1000)-1;if(!Number.isFinite(ms)||n<0||n>65535)throw new Error(name+'范围为 '+(1000/fs).toFixed(3)+'–'+(65536000/fs).toFixed(2)+' ms');return n;}
  function patchValue(before,p){return(before&(~p.mask&255))|(p.value&p.mask);}
  function assertAdapterClock(config,options={},device=null){
    const adapter=T.adapterProfile(device);
    const touchesInput=options.groups?.includes('routing')&&(!options.scope||Boolean(NODE_MASKS[options.scope]?.[25]&128));
    if(adapter?.fixedAudio&&touchesInput&&config.routing.input==='dmic'){
      if((options.profile||config.profile)!=='AC101S'||config.clock.fs!==48000||!T.deviceCapabilities(device)?.dmic48)throw new Error('48 kHz DMIC 需要 AC101S 和支持 DMIC 的桥接固件');
    }
    if(!adapter?.fixedAudio||!options.groups?.includes('clock'))return;
    const c=config.clock,mclk=options.mclkHz||c.fs*256;
    if(c.fs!==48000||c.bits!==16||c.slot!==32||c.slots!==2||c.format!=='I2S'||c.role!=='slave'||mclk!==12288000)throw new Error('桥接音频使用 48 kHz、16 位数据、32 位双时隙 I²S，Codec 为从机，MCLK 为 12.288 MHz');
  }
  function assertAdapterRegister(address,value,device=null){
    const adapter=T.adapterProfile(device);if(!adapter?.fixedAudio)return;
    if(address===25&&(value&128)&&!T.deviceCapabilities(device)?.dmic48)throw new Error('当前适配器未提供 48 kHz DMIC 支持');
    const fixed={4:[15,1],5:[15,1],7:[0xc0,0],8:[15,3],9:[3,0],10:[255,31],11:[0x34,0x14],12:[0x77,0x73],13:[0xef,0],14:[15,5]};
    const p=fixed[address];if(p&&(value&p[0])!==p[1])throw new Error('此寄存器值与桥接音频格式冲突，请在时钟模块查看配置');
  }
  function encode(config,{groups=['routing','eq','dynamics','clock'],mclkHz=config.clock.fs*256,checkStability=true,manualBase={},profile=(config.profile==='AC101S'?'AC101S':'AC102'),scope=null}={}){
    const c=normalize(clone(config)),r=c.routing,map=new Map(),notes=[],chosen=new Set(groups);
    // Real S31/AC101S A/B: bypassing EQ or AGC/HPF does not bypass its serial processing clock.
    // For an isolated effect edit, core enable comes from fresh hardware, not an unapplied draft.
    const adcOwned=chosen.has('routing')&&(!scope||Boolean(NODE_MASKS[scope]?.[25]&1)),dacOwned=chosen.has('routing')&&(!scope||Boolean(NODE_MASKS[scope]?.[27]&1));
    const adcActive=adcOwned?c.adc.enabled:Number.isInteger(manualBase[25])?Boolean(manualBase[25]&1):c.adc.enabled;
    const dacActive=dacOwned?c.dac.enabled:Number.isInteger(manualBase[27])?Boolean(manualBase[27]&1):c.dac.enabled;
    const add=(address,mask,value,group,label)=>{if(!Number.isInteger(value))throw new Error(label+'不是整数编码');const old=map.get(address);if(old){old.value=(old.value&~mask)|(value&mask);old.mask|=mask;old.groups.push(group);}else map.set(address,{address,mask,value:value&mask,groups:[group],label});};
    if(chosen.has('manual'))for(const [key,value]of Object.entries(c.raw)){const a=Number(key);if(value===manualBase[a])continue;if(!masks[a]){notes.push('跳过复位 / 供电电压 / 只读 / 保留地址 0x'+a.toString(16));continue;}add(a,masks[a],value,'manual','手动镜像');}
    if(chosen.has('routing')){
      add(2,4,r.mbias?4:0,'routing','麦克风偏置');
      add(3,0x31,(c.adc.enabled?16:0)|(c.dac.enabled?33:0),'routing','录音 / 播放与 DAC 模拟输出');
      add(6,0x3f,32|((c.adc.enabled?1:0))|((adcActive||c.hpf.enabled||c.agc.enabled)?2:0)|(c.dac.enabled?4:0)|(dacActive||c.eq.enabled?8:0)|((r.txEnabled||r.rxEnabled)?16:0),'routing','模块时钟');
      add(7,0x17,(r.sdoEnabled?16:0)|(r.txEnabled?4:0)|(r.rxEnabled?2:0)|1,'routing','I²S 收发');
      add(15,15,(1<<c.clock.slots)-1,'routing','TX 通道使能');
      add(17,15,r.txMap.reduce((v,x,i)=>v|(x<<i),0),'routing','TX 通道映射');
      add(19,255,Number(r.txL.rec)|(Number(r.txL.play)<<1)|(Number(r.txR.rec)<<2)|(Number(r.txR.rx)<<3)|(Number(r.txL.recHalf)<<4)|(Number(r.txL.playHalf)<<5)|(Number(r.txR.recHalf)<<6)|(Number(r.txR.rxHalf)<<7),'routing','TX 混音');
      add(22,255,r.rxMap.reduce((v,x,i)=>v|(x<<(i*2)),0),'routing','RX 通道映射');
      add(24,15,Number(r.rx.left)|(Number(r.rx.right)<<1)|(Number(r.rx.leftHalf)<<2)|(Number(r.rx.rightHalf)<<3),'routing','RX 混音');
      add(25,0xb1,(r.input==='dmic'?128:0)|(r.adcPattern<<4)|Number(c.adc.enabled),'routing','ADC / DMIC 与调试源');
      add(26,255,c.adc.mute?0:Math.round((c.adc.gain+64)*2+1),'routing','ADC 数字音量');
      add(27,7,(r.dacPattern<<1)|Number(c.dac.enabled),'routing','DAC 与调试源');
      add(28,255,c.dac.mute?0:Math.round((c.dac.gain+64)*2+1),'routing','DAC 数字音量');
      add(29,15,Number(r.dac.rx)|(Number(r.dac.rec)<<1)|(Number(r.dac.rxHalf)<<2)|(Number(r.dac.recHalf)<<3),'routing','DAC 混音');
      add(32,0xf9,(c.pga<<3)|Number(c.adc.enabled&&r.input==='analog'),'routing','PGA');
      if(!scope||scope==='lineamp'||scope==='output'){const differential=Number.isInteger(manualBase[38])?Boolean(manualBase[38]&16):Boolean(r.lineDifferential);add(38,0x2f,(r.lineOut?32:0)|R.lineGainCode(r.lineGain,differential),'routing','Line Out 使能与音量');}
    }
    if(chosen.has('eq')){add(0x4f,1,Number(c.eq.enabled),'eq','EQ 使能');
      // Actual S31/AC101S: clearing EQ_EN alone retained the previous response.
      // Program exact unity (including zero pre-gain) for Off, keeping the user's preset in the draft.
      const bypass=profile==='AC101S'&&!c.eq.enabled;
      const applied=bypass?Array.from({length:3},()=>({fixed:[65536,0,0,0,0]})):eqCoefficients(c,{checkStability});
      applied.forEach((b,i)=>b.fixed.forEach((v,j)=>{const a=0x50+i*16+j*3;add(a,7,(v>>16)&7,'eq','EQ 系数');add(a+1,255,(v>>8)&255,'eq','EQ 系数');add(a+2,255,v&255,'eq','EQ 系数');}));add(6,8,dacActive||c.eq.enabled?8:0,'eq','EQ 时钟');}
    if(chosen.has('dynamics')){
      const fs=c.clock.fs,sd=debounce(c.agc.debounce,fs),nd=debounce(c.agc.noiseDebounce,fs),decay=ticks(c.agc.release,fs,'AGC 恢复时间'),attack=ticks(c.agc.attack,fs,'AGC 启动时间');
      if(c.agc.enabled||c.hpf.enabled)add(3,4,4,'dynamics','AGC / HPF 全局使能');add(6,2,adcActive||c.hpf.enabled||c.agc.enabled?2:0,'dynamics','AGC / HPF 时钟');
      add(0x31,0x1c,(c.agc.enabled?16:0)|(c.hpf.enabled?8:0)|(c.agc.noiseDetect?4:0),'dynamics','AGC / HPF 开关');
      add(0x32,255,(nd.value<<4)|sd.value,'dynamics','AGC 消抖');add(0x33,63,Math.round(c.agc.target)&63,'dynamics','AGC 目标电平');add(0x34,255,Math.round(c.agc.maxGain*2),'dynamics','AGC 最大增益');
      add(0x39,255,decay>>8,'dynamics','AGC 恢复时间 H');add(0x3a,255,decay&255,'dynamics','AGC 恢复时间 L');add(0x3b,255,attack>>8,'dynamics','AGC 启动时间 H');add(0x3c,255,attack&255,'dynamics','AGC 启动时间 L');
      const nth=Math.round((-c.agc.threshold-30)/2);add(0x3d,31,nth,'dynamics','AGC 噪声门限');
      const fixed=hpf(c.hpf.freq,fs).fixed;[24,16,8,0].forEach((shift,i)=>add(0x42+i,i===0?7:255,(fixed>>shift)&255,'dynamics','一阶 HPF 系数'));
      notes.push('信号消抖实际 '+sd.actualMs.toFixed(3)+' ms，噪声消抖 '+nd.actualMs.toFixed(3)+' ms；噪声门限 '+(-30-nth*2)+' dBFS');
    }
    if(chosen.has('clock')){const fs=c.clock.fs,div=mclkHz/(128*fs),adcCode=ADC_DIV.findIndex(v=>Math.abs(v-div)<1e-7);if(adcCode<0)throw new Error('当前 MCLK '+mclkHz+' Hz 不能整分频得到 '+fs+' Hz / 128×ADC 时钟');
      const clockRole=c.clock.role==='master'?0xc0:0;add(4,15,adcCode,'clock','ADC 时钟分频');add(5,15,adcCode,'clock','DAC 时钟分频');add(7,0xc0,clockRole,'clock','BCLK / LRCK 输入输出');
      const bdiv=mclkHz/(fs*c.clock.slot*c.clock.slots),bcode=BCLK_DIV.findIndex(v=>Math.abs(v-bdiv)<1e-7);if(c.clock.role==='master'&&bcode<0)throw new Error('此 MCLK / 时隙配置不能生成所需 BCLK');if(bcode>=0)add(8,15,bcode+1,'clock','BCLK 分频');
      const period=(c.clock.format==='PCM'?c.clock.slot*c.clock.slots:c.clock.slot)-1;add(9,3,period>>8,'clock','LRCK 周期 H');add(10,255,period&255,'clock','LRCK 周期 L');
      const mode={PCM:0,LJ:0x10,I2S:0x14,RJ:0x20}[c.clock.format];if(mode===undefined)throw new Error('数据格式无效');add(11,0x34,mode,'clock','串行格式与偏移');add(12,0x77,((c.clock.slot/4-1)<<4)|(c.clock.bits/4-1),'clock','时隙 / 数据宽度');add(14,15,(c.clock.slots-1)*5,'clock','TX / RX 时隙数');
    }
    const touchesInput=!scope||Boolean(NODE_MASKS[scope]?.[25]&0x80);
    if(chosen.has('routing')&&touchesInput&&r.input==='dmic'&&!R.dmicSupported({...c,profile}))throw new Error(profile==='AC101S'?'AC101S DMIC 使用 16 或 48 kHz；48 kHz 需要支持 DMIC 的桥接固件':'AC102 DMIC 采样率范围为 8–24 kHz');
    return{patches:Array.from(map.values()).sort((a,b)=>a.address-b.address),notes};
  }
  function inferFs(snapshot,mclkHz){const a=ADC_DIV[(snapshot[4]||0)&15],b=ADC_DIV[(snapshot[5]||0)&15];if(!a||a!==b)return null;const fs=mclkHz/a/128;return FS.find(x=>Math.abs(fs-x)<.01)||null;}
  function makePlan(config,snapshot,options={}){let effective=config;if(options.scope==='hpf'||options.scope==='agc'){effective=clone(config);if(options.scope==='hpf')effective.agc.enabled=Boolean(snapshot[0x31]&16);else effective.hpf.enabled=Boolean(snapshot[0x31]&8);}const encoded=encode(effective,{...options,manualBase:snapshot});let patches=encoded.patches;if(options.scope){const owned=NODE_MASKS[options.scope];if(!owned)throw new Error('未知模块写入范围：'+options.scope);patches=patches.map(p=>({...p,mask:p.mask&(owned[p.address]||0)})).filter(p=>p.mask);}const expected=patches.map(p=>{if(!Number.isInteger(snapshot[p.address]))throw new Error('缺少寄存器 0x'+p.address.toString(16)+' 的新鲜读回，禁止猜测后写入');return{...p,before:snapshot[p.address],after:patchValue(snapshot[p.address],p)};});const steps=expected.filter(p=>p.before!==p.after);return{steps,expected,notes:encoded.notes,eqPhysicalBypass:(options.profile||config.profile)==='AC101S'};}
  function sequence(plan,snapshot){const changed=new Map(plan.steps.map(p=>[p.address,p]));if(!changed.size)return[];const stages=[],state={...snapshot};
    const stage=(address,mask,value,label)=>{const before=state[address];if(!Number.isInteger(before))throw new Error('缺少临时门控寄存器读回');const after=patchValue(before,{mask,value});if(before!==after){stages.push({address,mask,value,after,label});state[address]=after;}};
    const eq=plan.steps.some(s=>s.address>=0x50),dyn=plan.steps.some(s=>s.address>=0x32&&s.address<=0x45),clock=plan.steps.some(s=>s.groups.includes('clock')),play=eq||clock||plan.steps.some(s=>[3,0x1b,0x1c,0x1d,0x26].includes(s.address));
    if(play)stage(0x1c,255,0,'暂时静音 DAC');if(clock)stage(7,1,0,'暂停串行接口');if(eq)stage(0x4f,1,0,'暂停 EQ 系数更新');if(dyn)stage(0x31,0x18,0,'暂时旁路 AGC / HPF');
    const delayed=new Set([7,0x1c,0x31,0x4f]);for(const p of plan.steps)if(!delayed.has(p.address))stage(p.address,p.mask,p.value,p.label);
    // Latch unity while muted before returning EQ_EN to Off. Derive from target
    // registers so apply, undo and failure recovery obey the same physical contract.
    const targetEQ=changed.has(0x4f)?changed.get(0x4f).value:snapshot[0x4f];
    if(plan.eqPhysicalBypass&&eq&&!(targetEQ&1)&&decodeEq(state)?.every(b=>b.every((v,i)=>v===(i===0?1:0))))stage(0x4f,1,1,'载入平直 EQ 系数');
    for(const a of [0x31,0x4f,7,0x1c]){const p=changed.get(a);if(p){const temporaryMask=a===0x31&&dyn?0x18:a===7&&clock?1:0,extra=temporaryMask&~p.mask;stage(a,p.mask|extra,p.value|(snapshot[a]&extra),p.label);}else if((a===0x31&&dyn)||(a===0x4f&&eq)||(a===7&&clock)||(a===0x1c&&play))stage(a,a===0x31?0x18:a===7||a===0x4f?1:255,snapshot[a],'恢复原先门控 / 音量');}
    return stages;
  }
  function decodeEq(snapshot){const result=[];for(const base of [0x50,0x60,0x70]){const values=[];for(let i=0;i<5;i++){const a=base+i*3;if(![a,a+1,a+2].every(k=>Number.isInteger(snapshot[k])))return null;values.push(s19(((snapshot[a]&7)<<16)|(snapshot[a+1]<<8)|snapshot[a+2])/65536);}result.push(values);}return result;}
  function inferHpfFrequency(snapshot,fs){
    if(!Number.isFinite(fs)||fs<=0||![66,67,68,69].every(a=>Number.isInteger(snapshot[a])&&snapshot[a]>=0&&snapshot[a]<=255))return null;
    const raw=((snapshot[66]&7)*16777216)+(snapshot[67]<<16)+(snapshot[68]<<8)+snapshot[69];
    const signed=raw&0x4000000?raw-0x8000000:raw,a=signed/16777216,frequency=Math.atan((1-a)/(1+a))*fs/Math.PI;
    const rounded=Math.round(frequency*1000)/1000;
    return Number.isFinite(frequency)&&rounded>=.1&&rounded<=1000?rounded:null;
  }
  function decode(snapshot,config,{mclkHz=config.clock.fs*256}={}){const c=normalize(clone(config)),r=c.routing,notes=[],s=a=>snapshot[a];c.raw={...c.raw,...snapshot};
    c.pga=s(0x20)>>3;c.adc.enabled=Boolean(s(0x19)&1);c.dac.enabled=Boolean(s(0x1b)&1);c.adc.mute=s(0x1a)===0;c.dac.mute=s(0x1c)===0;c.adc.gain=c.adc.mute?0:(s(0x1a)-129)/2;c.dac.gain=c.dac.mute?0:(s(0x1c)-129)/2;
    r.input=s(0x19)&128?'dmic':'analog';r.adcPattern=(s(0x19)>>4)&3;r.dacPattern=(s(0x1b)>>1)&3;r.mbias=Boolean(s(2)&4);r.rxEnabled=Boolean(s(7)&2);r.txEnabled=Boolean(s(7)&4);r.sdoEnabled=Boolean(s(7)&16);r.rxMap=r.rxMap.map((_,i)=>(s(0x16)>>(2*i))&3);r.txMap=r.txMap.map((_,i)=>(s(0x11)>>i)&1);
    for(const [name,address,keys,shifts]of [['rx',0x18,['left','right','leftHalf','rightHalf'],[0,1,2,3]],['dac',0x1d,['rx','rec','rxHalf','recHalf'],[0,1,2,3]],['txL',0x13,['rec','play','recHalf','playHalf'],[0,1,4,5]],['txR',0x13,['rec','rx','recHalf','rxHalf'],[2,3,6,7]]])keys.forEach((k,i)=>r[name][k]=Boolean(s(address)&(1<<shifts[i])));
    r.lineOut=Boolean(s(0x26)&32);r.lineDifferential=Boolean(s(0x26)&16);r.lineGain=R.lineGainDb(s(0x26)&15,r.lineDifferential);c.hpf.enabled=Boolean(s(0x31)&8);c.agc.enabled=Boolean(s(0x31)&16);c.agc.noiseDetect=Boolean(s(0x31)&4);const tg=s(0x33)&63;c.agc.target=Math.max(-30,Math.min(-1,tg&32?tg-64:tg));c.agc.maxGain=Math.min(40,s(0x34)/2);c.agc.threshold=-30-2*(s(0x3d)&31);c.agc.threshold=Math.max(-90,c.agc.threshold);
    const fs=inferFs(snapshot,mclkHz);if(fs)c.clock.fs=fs;else notes.push('ADC / DAC 分频或 MCLK 无法推导统一采样率，保留当前 Fs。');
    c.agc.attack=((s(0x3b)<<8|s(0x3c))+1)/c.clock.fs*1000;c.agc.release=((s(0x39)<<8|s(0x3a))+1)/c.clock.fs*1000;const db=n=>n?Math.pow(2,n+1)/c.clock.fs*1000:0;c.agc.debounce=db(s(0x32)&15);c.agc.noiseDebounce=db(s(0x32)>>4);
    const fc=inferHpfFrequency(snapshot,fs);if(fc!==null)c.hpf.freq=fc;else notes.push('HPF 频率无法由当前系数与采样率推导，保留草稿。');
    c.eq.enabled=Boolean(s(0x4f)&1);notes.push('EQ 系数已读回，可显示设备曲线；频率 / Q 参数不可唯一反解，保留参数草稿。');
    const width=v=>4*((v&7)+1),slot=width(s(12)>>4),bits=width(s(12));if([16,24,32].includes(slot)&&[16,20,24].includes(bits)&&bits<=slot){c.clock.slot=slot;c.clock.bits=bits;}else notes.push('设备数据宽度超出当前编辑器选项，保留草稿。');
    const mode=(s(11)>>4)&3;c.clock.format=mode===0?'PCM':mode===2?'RJ':s(11)&4?'I2S':'LJ';c.clock.role=(s(7)&0xc0)===0xc0?'master':'slave';const slots=(s(14)&3)+1;if([1,2].includes(slots))c.clock.slots=slots;if(c.clock.format!=='PCM')c.clock.slots=2;
    return{config:c,notes,known:{sampleRate:Boolean(fs),hpfFrequency:fc!==null}};
  }
  function preview(config,before){try{const r={...before},encoded=encode(config,{checkStability:false});for(const p of encoded.patches)r[p.address]=patchValue(r[p.address]||0,p);return r;}catch{return before;}}
  const api={ADC_DIV,BCLK_DIV,FS,READ_ADDRESSES,masks,NODE_MASKS,normalize,hpf,eqCoefficients,debounce,ticks,patchValue,assertAdapterClock,assertAdapterRegister,encode,inferFs,inferHpfFrequency,makePlan,sequence,decodeEq,decode,preview};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AudioCodec=api;
})(typeof globalThis!=='undefined'?globalThis:this);
