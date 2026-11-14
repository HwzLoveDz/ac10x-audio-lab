/* Legacy parameter migration and offline register comparison. No device I/O. */
(function(root){
'use strict';
const common=typeof module!=='undefined'&&module.exports,C=common?require('./codec.js'):root.AudioCodec;
const copy=x=>JSON.parse(JSON.stringify(x)),hex=n=>'0x'+n.toString(16).toUpperCase().padStart(2,'0');
function text(input){if(typeof input!=='string'||input.length>262144)throw Error('旧文件需为不超过256KB的文本');return input.replace(/^\uFEFF/,'').replace(/\r/g,'');}
function fields(line){const o={};for(const part of line.split(',')){const m=part.trim().match(/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*(\S+)$/);if(!m||Object.hasOwn(o,m[1]))throw Error('参数格式错误或重复');o[m[1]]=m[2];}return o;}
function num(o,k,min,max){if(!Object.hasOwn(o,k)||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(o[k]))throw Error(k+' 缺失或不是有效数值');const v=Number(o[k]);if(!Number.isFinite(v)||v<min||v>max)throw Error(k+' 超出可表示范围');return v;}
function parsePreset(input,base){
 const s=text(input),lines=s.split('\n').map(x=>x.trim()),config=copy(base),fs=config.clock.fs,notes=[];
 if(!C.FS.includes(fs))throw Error('请先选择受支持的草稿采样率');
 const eqCount=lines.filter(x=>x==='EQ').length,agcCount=lines.filter(x=>x==='AGC').length;if(eqCount+agcCount!==1)throw Error('文件必须只包含一组EQ或AGC参数');
 if(lines.filter(x=>x==='EQ').length===1){
  const start=lines.indexOf('EQ'),e=fields(lines[start+1]||''),g=fields(lines[start+2]||'');
  if(!['True','False'].includes(e.EQ_EN))throw Error('EQ_EN 必须是 True 或 False');
  const types={Peaking:'peaking',Low_Shelf:'lowshelf',High_Shelf:'highshelf',Low_Pass:'lowpass',High_Pass:'highpass'};
  config.eq={enabled:e.EQ_EN==='True',preGain:num(g,'PreGainDB',-18,0),bands:[]};
  for(let i=1;i<=3;i++){
   const key='BQ'+i;if(lines.filter(x=>x===key).length!==1)throw Error(key+' 缺失或重复');
   const v=fields(lines[lines.indexOf(key)+1]||''),type=types[v.FilterType];if(!type)throw Error('不支持的原厂滤波器类型');
   config.eq.bands.push({enabled:true,type,freq:num(v,'Fc',20,Math.min(20000,fs/2-1)),gain:num(v,'G',-15,15),q:num(v,'Q',.1,10)});
  }
  C.eqCoefficients(config);
  notes.push('按当前草稿 '+fs+' Hz 重新计算；原文件未保存采样率，未直接采用系数转储。');
  return{kind:'eq',config,notes};
 }
 if(lines.filter(x=>x==='AGC').length===1){
  const v=fields(lines[lines.indexOf('AGC')+1]||''),time=lines.indexOf('AGCTime(ms)');if(time<0)throw Error('缺少 AGC 时间字段');
  const r=fields(lines[time+2]||'');
  function reg(k,max){if(!/^[0-9a-f]{1,4}$/i.test(r[k]||''))throw Error(k+' 缺失或不是十六进制');const n=parseInt(r[k],16);if(n>max)throw Error(k+' 超出寄存器范围');return n;}
  config.agc.target=num(v,'TargetLevel',-30,-1);config.agc.threshold=num(v,'NoiseThreshold',-90,-30);config.agc.maxGain=num(v,'MaxGain',0,40);
  if(!Number.isInteger(config.agc.target)||!Number.isInteger((-config.agc.threshold-30)/2)||!Number.isInteger(config.agc.maxGain*2))throw Error('AGC 电平必须对齐硬件量化步进');
  config.agc.release=(reg('DecayTimeReg',65535)+1)*1000/fs;config.agc.attack=(reg('AttackTimeReg',65535)+1)*1000/fs;
  const sd=reg('SignalDebounceTimeReg',15),nd=reg('NoiseDebounceTimeReg',15);
  config.agc.debounce=sd?2**(sd+1)*1000/fs:0;config.agc.noiseDebounce=nd?2**(nd+1)*1000/fs:0;
  C.encode(config,{groups:['dynamics']});
  notes.push('以十六进制时间寄存器为准，按当前草稿 '+fs+' Hz 换算；保留 AGC 使能、噪声检测和 HPF 状态。');
  return{kind:'agc',config,notes};
 }
 throw Error('请选择原厂 EQ 或 AGC .AC102 参数文件；Configure.AC102 是通信设置，不能导入参数。');
}
function parseRegisterList(input){
 const s=text(input).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,''),registers={};
 for(const line of s.split('\n')){
  const v=line.trim();if(!v||/^address\s*,\s*(?:register\s*,\s*)?value$/i.test(v))continue;
  const m=v.match(/^(?:\[|\{)?\s*(0x[0-9a-f]{1,2})\s*,\s*(0x[0-9a-f]{1,2})\s*(?:\]|\})?\s*[,;]?$/i);
  if(!m)throw Error('寄存器表只接受0x地址,0x值文本或两列CSV');
  const a=Number(m[1]),n=Number(m[2]);if(a>126)throw Error('地址超出范围');
  if(Object.hasOwn(registers,a))throw Error('重复地址 '+hex(a)+'；原工具部分HPF文本导出可能重复0x42，请核对0x42–0x45，不能覆盖猜值。');
  registers[a]=n;
 }
 if(!Object.keys(registers).length)throw Error('没有寄存器记录');return registers;
}
function compareRegisters(reference,current){return Object.keys(reference).map(Number).sort((a,b)=>a-b).map(address=>({address,reference:reference[address],current:current?.[address]??null,mask:C.masks[address]||0,changed:current?.[address]===undefined?null:reference[address]!==current[address]}));}
function exportMasked(config,{groups=['routing','eq','dynamics'],mclkHz=12288000}={}){
 if(!groups.length||groups.some(g=>!['routing','eq','dynamics','clock'].includes(g)))throw Error('请选择有效导出范围');
 const encoded=C.encode(config,{groups,mclkHz});
 let out='/* AC10x Audio Lab masked patches from DRAFT. Not a board initializer.\n * Fs='+config.clock.fs+' Hz; MCLK reference='+mclkHz+' Hz; groups='+groups.join(',')+'.\n * No reset or supply-voltage writes. Preserve bits outside each mask.\n * target = (fresh_read & ~mask) | (value & mask); verify masked readback.\n * Integrator must mute/gate modules before clock/EQ/AGC changes and sequence enable last.\n * This table alone does not implement dependency ordering, rollback or timing.\n */\n#include <stdint.h>\nstatic const struct { uint8_t address, mask, value; } ac10x_draft_patches[] = {\n';
 for(const v of encoded.patches){if(!v.mask||[0,1].includes(v.address))throw Error('不能导出复位或电源电压写入');out+='    { '+hex(v.address)+', '+hex(v.mask)+', '+hex(v.value&v.mask)+' }, /* '+v.label.replace(/\*\//g,'')+' */\n';}
 return out+'};\n';
}
const api={parsePreset,parseRegisterList,compareRegisters,exportMasked};if(common)module.exports=api;else root.AudioLegacy=api;
})(typeof globalThis!=='undefined'?globalThis:this);
