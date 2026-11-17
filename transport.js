/* TAS1020 / X-Powers HID control transport. Report offsets verified against the
 * supplied AC102_SW.exe. WebHID payloads exclude Windows' leading report-ID byte. */
(function(root){
  'use strict';
  const ADAPTERS=Object.freeze([
    {vendorId:0x0451,productId:0x4822,kind:'TI',statusQuery:false,fixedAudio:false,softwareCandidate:false},
    {vendorId:0x303a,productId:0x4004,kind:'S31',statusQuery:true,fixedAudio:true,softwareCandidate:false},
    {vendorId:0x303a,productId:0x4005,kind:'S3',statusQuery:true,fixedAudio:true,softwareCandidate:true}
  ].map(Object.freeze));
  const adapterProfile=device=>ADAPTERS.find(p=>p.vendorId===device?.vendorId&&p.productId===device?.productId)||null;
  const deviceFilters=()=>ADAPTERS.map(p=>({vendorId:p.vendorId,productId:p.productId,...(p.fixedAudio?{usagePage:0xff00}:{})}));
  class BridgeError extends Error{constructor(code,message,details={}){super(message);this.name='BridgeError';this.code=code;this.details=details;}}
  function byte(v,name){if(!Number.isInteger(v)||v<0||v>255)throw new BridgeError('ARGUMENT',name+' 必须为 0–255 的整数');return v;}
  function reportBytes(report){return Math.ceil((report.items||[]).reduce((n,item)=>n+(item.reportSize||0)*(item.reportCount||0),0)/8);}
  function descriptors(collections){const out=[],input=[];function visit(c){for(const r of c.outputReports||[])out.push({id:r.reportId,bytes:reportBytes(r)});for(const r of c.inputReports||[])input.push({id:r.reportId,bytes:reportBytes(r)});for(const child of c.children||[])visit(child);}collections.forEach(visit);
    const unique=a=>{const m=new Map();for(const r of a)if(!m.has(r.id)||m.get(r.id).bytes<r.bytes)m.set(r.id,r);return Array.from(m.values());};return{output:unique(out),input:unique(input)};
  }
  function selectReports(device){const reports=descriptors(device.collections||[]),out=reports.output.find(r=>r.id===0&&r.bytes>=8),input=reports.input.find(r=>r.id===0&&r.bytes>=9);
    if(!out||!input)throw new BridgeError('DESCRIPTOR','未找到原适配器要求的 Report ID 0（输出至少 8 字节、输入至少 9 字节）',reports);
    return{output:out,input};
  }
  function encode({command,address=0,value=0,i2cAddress=0x33,addressWidth=1,dataWidth=1},length){
    if(![0,1,2,0x7c,0x7d,0x7e].includes(command))throw new BridgeError('COMMAND','不支持此调试命令');
    if(!Number.isInteger(length)||length<8)throw new BridgeError('DESCRIPTOR','输出报告长度不足');
    const p=new Uint8Array(length);p[0]=command;p[1]=1;
    if(command===0x7c||command===0x7d){if(length!==10)throw new BridgeError("DESCRIPTOR","AEC requires 10-byte reports");if(command===0x7c&&![0,1].includes(value))throw new BridgeError("ARGUMENT","Invalid AEC mode");p[2]=value;return p;}
    if(command===0x7e){if(length!==10)throw new BridgeError('DESCRIPTOR','桥接状态命令需要10字节报告');return p;}
    if(command===2){p[2]=value?1:0;return p;}
    if(!Number.isInteger(i2cAddress)||i2cAddress<0x08||i2cAddress>0x77)throw new BridgeError('ARGUMENT','I²C 地址必须使用 7 位格式');
    if(![1,2].includes(addressWidth)||![1,2].includes(dataWidth)||!Number.isInteger(address)||address<0||address>=(addressWidth===1?256:65536)||!Number.isInteger(value)||value<0||value>=(dataWidth===1?256:65536))throw new BridgeError('ARGUMENT','寄存器宽度或数据超出范围');
    p[0]|=addressWidth===2?0x10:0;p[2]=i2cAddress<<1;p[3]=(address>>8)&255;p[4]=address&255;p[5]=dataWidth===1?value:(value>>8)&255;p[6]=dataWidth===1?0:value&255;p[7]=dataWidth;return p;
  }
  function decode(data,request){const p=data instanceof Uint8Array?data:new Uint8Array(data.buffer,data.byteOffset||0,data.byteLength);if(p.length<1)return null;
    if(request.command===0x7c||request.command===0x7d){
      if(p[0]!==request.command)return null;
      if(p.length!==10)throw new BridgeError('SHORT_REPORT','AEC response must contain 10 bytes');
      if(p[1]===0&&p[8]===0){if(request.command===0x7c)throw new BridgeError('AEC_REJECTED','AEC command is not supported by this firmware');return{supported:false,enabled:false};}
      if(p[1]!==0xae||p[2]!==1||p[3]!==1||![0,1].includes(p[4]))throw new BridgeError('AEC_RESPONSE','Invalid AEC status');
      if(p[8]!==1)throw new BridgeError('AEC_REJECTED','AEC 未能启用：请核对固件、剩余内存和参考路由');
      if(request.command===0x7c&&p[4]!==request.value)throw new BridgeError('AEC_RESPONSE','AEC mode readback differs from request');
      return{supported:true,enabled:Boolean(p[4]),extensionVersion:1,faultsLow8:p[5],dropsLow8:p[6],maxProcessMs:p[7],framesLow8:p[9],raw:Array.from(p)};
    }
    if(request.command===0x7e){if(p[0]!==0x7e)return null;if(p.length!==10)throw new BridgeError('SHORT_REPORT','桥接状态报告长度不正确');if(p[1]!==1||p[8]!==1||[p[4],p[5],p[6]].some(v=>v!==0&&v!==1))throw new BridgeError('STATUS_RESPONSE','桥接状态回复无效');return{command:0x7e,protocolVersion:p[2]+'.'+p[3],clockGate:Boolean(p[4]),playbackActive:Boolean(p[5]),captureActive:Boolean(p[6]),i2cErrorsLow8:p[7],busyLow8:p[9],raw:Array.from(p)};}
    const command=p[0]&15;if(command!==request.command)return null;
    if(command===2)return{command,acknowledged:true,raw:Array.from(p)};
    const min=command===1?8:9;if(p.length<min)throw new BridgeError('SHORT_REPORT','适配器返回的数据长度不足',{length:p.length,expected:min});
    if(command===1){const address=request.addressWidth===2?(p[4]<<8)|p[5]:p[5];if(address!==request.address)return null;if(p[7]!==1)throw new BridgeError('I2C_NACK','I²C 读取失败：检查地址、供电与连接',{address,status:p[7]});return{command,address,value:request.dataWidth===2?(p[2]<<8)|p[3]:p[2],raw:Array.from(p)};}
    if(p[8]!==1)throw new BridgeError('I2C_NACK','适配器未确认寄存器写入',{address:request.address,status:p[8]});
    return{command,address:request.address,acknowledged:true,raw:Array.from(p)};
  }
  class HidBridge{
    constructor(device,{i2cAddress=0x33,timeoutMs=1200,onLog=()=>{},onState=()=>{}}={}){this.device=device;this.i2cAddress=i2cAddress;this.timeoutMs=timeoutMs;this.onLog=onLog;this.onState=onState;this.reports=null;this.pending=null;this.queue=Promise.resolve();this.connected=false;this.fault=null;this.inputHandler=e=>this.handleInput(e);this.disconnectHandler=e=>{if(e.device===this.device)this.disconnected();};}
    async open(){const profile=adapterProfile(this.device);if(!profile)throw new BridgeError('DEVICE','请选择 TI 0451:4822、S31 303A:4004 或 S3 303A:4005 适配器');this.reports=selectReports(this.device);if(profile.fixedAudio&&(this.reports.input.bytes!==10||this.reports.output.bytes!==10))throw new BridgeError('DESCRIPTOR','S3 / S31 需要双向 10 字节 HID 报告');if(!this.device.opened)await this.device.open();this.device.addEventListener('inputreport',this.inputHandler);if(typeof navigator!=='undefined'&&navigator.hid)navigator.hid.addEventListener('disconnect',this.disconnectHandler);this.connected=true;this.fault=null;this.onState('connected');return this;}
    log(direction,request,payload,extra={}){try{this.onLog({time:new Date().toISOString(),direction,command:request.command,address:request.address,payload:Array.from(payload),...extra});}catch{}}
    async close(){this.connected=false;this.rejectPending(new BridgeError('DISCONNECTED','设备连接已关闭'));this.device.removeEventListener('inputreport',this.inputHandler);if(typeof navigator!=='undefined'&&navigator.hid)navigator.hid.removeEventListener('disconnect',this.disconnectHandler);if(this.device.opened)await this.device.close();this.onState('disconnected');}
    disconnected(){this.connected=false;this.rejectPending(new BridgeError('DISCONNECTED','USB 设备已断开'));this.onState('disconnected');}
    rejectPending(error){if(this.pending){const p=this.pending;this.pending=null;clearTimeout(p.timer);p.reject(error);}}
    handleInput(event){if(!this.connected||event.reportId!==this.reports.input.id||!this.pending)return;const pending=this.pending;try{const data=new Uint8Array(event.data.buffer,event.data.byteOffset,event.data.byteLength);this.log('IN',pending.request,data);
      if(adapterProfile(this.device)?.fixedAudio&&[0,1].includes(pending.request.command)){
        if(data.length!==10)throw new BridgeError('SHORT_REPORT','桥接器必须返回10字节报告');
        const q=pending.request,bus=this.i2cAddress<<1;
        if(data[0]!==q.command||data[1]!==1||data[4]!==0||data[5]!==q.address||data[6]!==1||data[q.command===1?8:7]!==bus)return;
      }
      const reply=decode(data,pending.request);if(!reply)return;this.pending=null;clearTimeout(pending.timer);pending.resolve(reply);}catch(error){this.rejectPending(error);if(error.code==='SHORT_REPORT')this.fail(error);}}
    fail(error){this.fault=error;this.onState('fault',error);}
    exclusive(work){const run=this.queue.then(()=>{if(!this.connected)throw new BridgeError('DISCONNECTED','请先连接 USB 调试设备');if(this.fault)throw new BridgeError('DESYNC','上一笔通信失去同步，请断开后重新连接',{cause:this.fault.code});return work();});this.queue=run.catch(()=>{});return run;}
    async exchange(request){if(this.pending)throw new BridgeError('BUSY','已有待完成的 HID 请求');const payload=encode({...request,i2cAddress:this.i2cAddress},this.reports.output.bytes);let resolve,reject;const reply=new Promise((a,b)=>{resolve=a;reject=b;});reply.catch(()=>{});
      const timer=setTimeout(()=>{const error=new BridgeError('TIMEOUT','适配器应答超时；为避免串包，本次连接已停止读写');this.rejectPending(error);this.fail(error);},this.timeoutMs);this.pending={request,resolve,reject,timer};
      try{this.log('OUT',request,payload);await this.device.sendReport(this.reports.output.id,payload);const answer=await reply;const profile=adapterProfile(this.device);if(profile?.fixedAudio&&request.command===2&&(answer.raw[8]!==1||answer.raw[2]!==request.value))throw new BridgeError('GATE_REJECTED','桥接器未确认音频时钟开关');if(profile?.kind==='S3'&&request.command===0x7e&&answer.protocolVersion!=='0.1')throw new BridgeError('PROTOCOL_VERSION','S3 协议版本不受支持；当前仅支持协议 0.1',{received:answer.protocolVersion});return answer;}catch(error){this.rejectPending(error);if(!['I2C_NACK','DISCONNECTED','AEC_REJECTED'].includes(error.code))this.fail(error);throw error;}
    }
    readRegister(address){byte(address,'寄存器地址');return this.exclusive(async()=>{const reply=await this.exchange({command:1,address,dataWidth:1,addressWidth:1});return reply.value;});}
    writeRegister(address,value){byte(address,'寄存器地址');byte(value,'寄存器值');return this.exclusive(async()=>{await this.exchange({command:0,address,value,dataWidth:1,addressWidth:1});const read=await this.exchange({command:1,address,dataWidth:1,addressWidth:1});return read.value;});}
    setMclk(enabled){if(typeof enabled!=='boolean')throw new BridgeError('ARGUMENT','时钟开关必须是布尔值');return this.exclusive(()=>this.exchange({command:2,value:enabled?1:0}));}
    getAEC(){return this.exclusive(()=>{if(adapterProfile(this.device)?.kind!=='S3')return{supported:false,enabled:false};return this.exchange({command:0x7d});});}
    setAEC(enabled){if(typeof enabled!=='boolean')throw new BridgeError('ARGUMENT','AEC mode must be boolean');return this.exclusive(()=>{if(adapterProfile(this.device)?.kind!=='S3')throw new BridgeError('CAPABILITY','AEC requires S3 firmware');return this.exchange({command:0x7c,value:enabled?1:0});});}
    getStatus(){return this.exclusive(()=>{if(!adapterProfile(this.device)?.statusQuery)throw new BridgeError('CAPABILITY','此适配器未提供桥接状态查询');return this.exchange({command:0x7e});});}
  }
  const api={ADAPTERS,adapterProfile,deviceFilters,BridgeError,reportBytes,descriptors,selectReports,encode,decode,HidBridge};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AudioHardwareTransport=api;
})(typeof globalThis!=='undefined'?globalThis:this);
