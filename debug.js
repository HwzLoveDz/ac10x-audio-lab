/* Pure configuration, snapshot comparison, and evidence-labelled diagnostics. */
(function(root){
  'use strict';
  const common=typeof module!=='undefined'&&module.exports;
  const C=common?require('./codec.js'):root.AudioCodec,R=common?require('./routing.js'):root.AudioRouting,D=common?require('./dsp.js'):root.AudioDSP;
  const T=common?require('./transport.js'):root.AudioHardwareTransport;
  const VERSION='0.8.5-rc.1',profiles=['AC102-reference','AC101S','AC102'];
  const clone=x=>JSON.parse(JSON.stringify(x));
  function safeObject(value,depth=0){
    if(depth>12)throw new Error('配置嵌套过深');
    if(!value||typeof value!=='object')return;
    for(const key of Object.keys(value)){
      if(['__proto__','constructor','prototype'].includes(key))throw new Error('配置包含不支持的对象键');
      safeObject(value[key],depth+1);
    }
  }
  function parseConfig(input){
    const value=typeof input==='string'?JSON.parse(input):clone(input);safeObject(value);
    let c=value;
    if(value?.format==='AC10x-configuration'){
      if(value.schemaVersion!==1)throw new Error('配置文档版本不受支持');c=value.config;
    }else if(value?.format==='AC10x-debug-bundle'){
      if(value.schemaVersion!==1)throw new Error('调试包版本不受支持');c=value.draft;
    }
    if(!c||Array.isArray(c)||c.version!==1||!profiles.includes(c.profile))throw new Error('不是兼容的 AC10x 配置');
    return clone(c);
  }
  function normalizeSnapshot(input){
    const v=typeof input==='string'?JSON.parse(input):clone(input);safeObject(v);
    const raw=v?.registers||v?.snapshot||v;
    if(!raw||Array.isArray(raw)||typeof raw!=='object')throw new Error('寄存器快照格式无效');
    const s={};
    for(const [key,value] of Object.entries(raw)){
      if(!/^(?:0x[0-9a-f]{1,2}|\d{1,3})$/i.test(key))throw new Error('快照地址必须为十六进制或十进制字节');
      const a=Number(key);if(!Number.isInteger(a)||a<0||a>126||!Number.isInteger(value)||value<0||value>255||Object.hasOwn(s,a))throw new Error('快照地址重复或数值超出范围');
      s[a]=value;
    }
    if(s[0]!==0x12)throw new Error('快照缺少匹配的芯片 ID 0x12');
    return s;
  }
  function diffSnapshots(before,after){
    const a=normalizeSnapshot(before),b=normalizeSnapshot(after);
    return [...new Set([...Object.keys(a),...Object.keys(b)])].map(Number).sort((x,y)=>x-y)
      .filter(address=>a[address]!==b[address]).map(address=>({address,before:a[address]??null,after:b[address]??null,
        changedMask:a[address]===undefined||b[address]===undefined?null:a[address]^b[address],writableMask:C.masks[address]||0}));
  }
  function mutedS31Template(config,{lineDifferential=false}={}){
    const c=parseConfig(config);c.profile='AC101S';c.pga=12;
    c.adc={enabled:true,gain:0,mute:false};c.dac={enabled:true,gain:-12,mute:true};
    c.clock={fs:48000,format:'I2S',bits:16,slot:32,slots:2,role:'slave'};
    c.routing=R.defaults();Object.assign(c.routing,{lineGain:-18,lineDifferential,
      rx:{left:true,right:true,leftHalf:true,rightHalf:true}});
    c.eq.enabled=false;c.hpf.enabled=false;c.agc.enabled=false;
    c.eq.preGain=0;c.eq.bands.forEach(b=>{b.enabled=false;b.gain=0;});c.raw={};
    return c;
  }
  function adapterInfo(device){
    if(!device)return null;
    const profile=T.adapterProfile(device);
    return{vendorId:device.vendorId,productId:device.productId,productName:String(device.productName||''),
      kind:profile?.kind||'unknown',statusQuery:Boolean(profile?.statusQuery),softwareCandidate:Boolean(profile?.softwareCandidate)};
  }
  function diagnose(snapshot,{stale=true,adapter=null,mclkHz=12288000,status=null,profile='AC101S'}={}){
    const out=[],add=(id,severity,title,detail,evidence='register-readback')=>out.push({id,severity,title,detail,evidence});
    if(!snapshot){add('connection','unknown','尚无设备快照','连接设备并读回后生成诊断','none');return out;}
    if(stale)add('freshness','warning','当前快照已过期','先重新读回；过期快照不用于写入','session-state');
    if(snapshot[0]!==0x12){add('chip','error','芯片 ID 不匹配','已停止使用当前寄存器表');return out;}
    add('chip','ok','ID 0x12 · '+profile+' 参数表','具体型号以板卡标注为准');
    const fs=C.inferFs(snapshot,mclkHz);
    add('sample-rate',fs?'ok':'warning',fs?'推导 Fs '+fs+' Hz':'无法推导统一 Fs','来自 ADC/DAC 分频和填写的 MCLK，未测量时钟','calculated');
    if((snapshot[49]&8)&&C.inferHpfFrequency(snapshot,fs)===null)add('hpf-frequency','warning','HPF 截止频率未知','当前系数或参考时钟无法给出支持范围内的频率；草稿数值不是设备读回。','calculated');
    if(['S31','S3'].includes(adapter?.kind)){
      const match=fs===48000&&(snapshot[7]&0xc0)===0&&(snapshot[12]&0x77)===0x73&&snapshot[10]===31&&(snapshot[11]&0x34)===0x14;
      const s3=adapter.kind==='S3';add(s3?'s3-format':'s31-format',match?'ok':'error',s3?(match?'S3 固定格式一致':'S3 与 Codec 格式不一致'):(match?'S31 固定格式一致':'S31 与 Codec 格式不一致'),'48kHz / 16位数据 / 32位双时隙 / I²S 从机');
      if(s3)add('s3-validation','warning','S3 软件候选，尚未实机验证','开发 PID 303A:4005；实际板型、供电与引脚需另行核对','support-status');
      if(status){
        add('bridge',status.clockGate?'ok':'warning',status.clockGate?'桥接时钟已开启':'桥接时钟已关闭',`协议${status.protocolVersion}；播放${status.playbackActive?'活动':'空闲'}；录音${status.captureActive?'活动':'空闲'}`,'bridge-status');
        if(status.i2cErrorsLow8||status.busyLow8)add('bridge-errors','warning','桥接端有错误或忙记录',`I²C=${status.i2cErrorsLow8}，忙=${status.busyLow8}（协议计数读回）`,'bridge-status');
      }else add('bridge','unknown','桥接实时状态尚未查询','点击“查询桥接器状态”；固件版本未由此协议提供','none');
    }
    const adc=Boolean(snapshot[3]&16)&&Boolean(snapshot[25]&1)&&Boolean(snapshot[32]&1);
    add('record',adc?'ok':'info',adc?'模拟录音通道已开启':'模拟录音通道未完全开启','检查 REC、ADC_DIG_EN、ADC/PGA 三处使能');
    if(snapshot[25]&0x30)add('adc-pattern','warning','ADC 正在使用调试源','当前采集不代表正常模拟输入');
    if(snapshot[27]&6)add('dac-pattern','warning','DAC 正在使用调试源','当前播放源并非普通 USB PCM');
    const playback=(snapshot[3]&0x21)===0x21&&Boolean(snapshot[27]&1)&&Boolean(snapshot[38]&32);
    add('playback',playback?'ok':'info',playback?'DAC / Line Out 通道已开启':'播放模拟通道未完全开启','检查播放功能、DAC 和 Line Out 使能');
    add('mute',snapshot[28]===0?'info':'ok',snapshot[28]===0?'DAC 当前静音':'DAC 数字增益 '+((snapshot[28]-129)/2)+' dB','这是设备数字音量读回，不是声压测量');
    if(snapshot[29]&2)add('monitor','warning','录音本地监听已开启','扬声器和麦克风同时连接时，应检查回授和各级增益');
    if((snapshot[79]&1)&&C.decodeEq(snapshot)?.some(c=>!D.stable(c)))add('eq-stability','error','读回 EQ 系数存在不稳定极点','先核对系数和格式，避免继续提高增益');
    return out;
  }
  function monitorAddresses(text){
    const tokens=String(text).split(/[,;\s]+/).filter(Boolean);
    if(!tokens.length||tokens.length>8)throw new Error('请选择1至8个寄存器地址');
    const addresses=tokens.map(t=>{if(!/^(?:0x)?[a-f0-9]{1,2}$/i.test(t))throw new Error('监视地址必须为Hex字节');return parseInt(t.replace(/^0x/i,''),16);});
    if(new Set(addresses).size!==addresses.length||addresses.some(a=>!C.READ_ADDRESSES.includes(a)))throw new Error('监视地址重复或不在已核对寄存器表中');
    return addresses;
  }
  function debugBundle({device,snapshot,readAt,stale,draft,baseline,status,history=[],events=[],droppedEvents=0,diagnostics=[],monitor=[],referenceMclkHz=null}){
    return{format:'AC10x-debug-bundle',schemaVersion:1,appVersion:VERSION,createdAt:new Date().toISOString(),
      adapter:adapterInfo(device),snapshot:snapshot?clone(snapshot):null,readAt:readAt||null,stale:Boolean(stale),
      draft:parseConfig(draft),referenceMclkHz,baseline:baseline?clone(baseline):null,bridgeStatus:status?clone(status):null,
      transactions:clone(history),events:clone(events),droppedEvents,diagnostics:clone(diagnostics),monitor:clone(monitor),
      evidenceNote:'设备读回、推导、桥接状态、草稿和未测量项目分别记录；不自动采集录音、设备序列号或本机文件路径'};
  }
  const api={VERSION,profiles,parseConfig,normalizeSnapshot,diffSnapshots,mutedS31Template,mutedBridgeTemplate:mutedS31Template,adapterInfo,diagnose,monitorAddresses,debugBundle};
  if(common)module.exports=api;else root.AudioDebug=api;
})(typeof globalThis!=='undefined'?globalThis:this);
