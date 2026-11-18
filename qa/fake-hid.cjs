const C=require('../codec.js'),R=require('../routing.js');
function config(){return C.normalize({version:1,profile:'AC102-reference',routing:R.defaults(),pga:12,adc:{enabled:true,gain:0},dac:{enabled:true,gain:0},hpf:{enabled:true,freq:80},agc:{enabled:true,target:-14,threshold:-70,maxGain:20,attack:2/3,release:120,debounce:4/3},eq:{enabled:true,preGain:-3,bands:[{enabled:true,type:'peaking',freq:200,gain:0,q:1},{enabled:true,type:'peaking',freq:1000,gain:3,q:1},{enabled:true,type:'peaking',freq:8000,gain:0,q:1}]},clock:{fs:48000,format:'I2S',bits:24,slot:32,slots:2,role:'slave'},raw:{}});}
function memory(){const m=Object.fromEntries(C.READ_ADDRESSES.map(a=>[a,0]));Object.assign(m,{0:0x12,1:0x73,2:0x1b,3:0x34,4:1,5:1,6:0x3f,7:0x17,8:3,10:31,11:0x15,12:0x75,13:0x60,14:5,15:3,17:10,19:5,22:0xe4,24:1,25:1,26:0x81,27:1,28:0x81,29:1,32:0x61,38:0x2f,49:0x1d,50:0xc5,51:0x32,52:40,58:95,60:31,61:20,66:0,67:0xff,68:0xfa,69:0xc1,70:9,79:0});for(const base of [0x50,0x60,0x70])m[base]=1;return m;}
class FakeHID{
 constructor({mem=memory(),hook=null,bytes=64}={}){this.vendorId=0x0451;this.productId=0x4822;this.productName='PROTOCOL SIMULATOR — NOT HARDWARE';this.collections=[{usagePage:0xff00,usage:1,outputReports:[{reportId:0,items:[{reportSize:8,reportCount:bytes}]}],inputReports:[{reportId:0,items:[{reportSize:8,reportCount:bytes}]}],children:[]}];this.opened=false;this.mem={...mem};this.hook=hook;this.listeners=new Map();this.sent=[];this.active=0;this.maxActive=0;this.writes=0;this.dmicFirmware=false;}
 async open(){this.opened=true;}
 async close(){this.opened=false;}
 addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);}
 removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
 emit(bytes,id=0){const data=new Uint8Array(bytes);for(const fn of this.listeners.get('inputreport')||[])fn({reportId:id,data:new DataView(data.buffer)});}
 async sendReport(id,buffer){if(!this.opened)throw new Error('fake disconnected');if(id!==0)throw new Error('wrong report ID');const p=Uint8Array.from(buffer),command=[0x7a,0x7c,0x7d,0x7e].includes(p[0])?p[0]:p[0]&15,address=(p[3]<<8)|p[4],value=p[5];this.sent.push({id,payload:Array.from(p),command,address,value});this.active++;this.maxActive=Math.max(this.maxActive,this.active);if(command===0)this.writes++;const action=this.hook?.({command,address,value,writes:this.writes,device:this})||{};
   const response=new Uint8Array(p.length);response[0]=command;response[4]=address>>8;response[5]=address&255;
   if(this.vendorId===0x303a){response[1]=1;if([0,1].includes(command)){response[6]=p[7];response[command===1?8:7]=p[2];}if(command===2){response[2]=p[2];response[8]=1;}if(command===0x7e)response.set([0x7e,1,0,1,1,0,0,0,1,0]);}
   if(command===0x7a){response.fill(0);response[0]=command;if(this.dmicFirmware)response.set([0x7a,0xd4,1,this.aecFirmware?7:5,0,4,0,48,48,1]);}
   if([0x7c,0x7d].includes(command)){response.fill(0);response[0]=command;if(this.aecFirmware){if(command===0x7c)this.aecEnabled=Boolean(p[2]);response.set([command,0xae,1,1,this.aecEnabled?1:0,0,0,7,1,0]);}}
   if(command===1){response[2]=this.mem[address]??0;response[7]=action.nack?0:1;}
   if(command===0){this.aecEnabled=false;if(!action.nack){const eqBase=[0x50,0x60,0x70].find(a=>address>=a&&address<a+15);const mask=eqBase!==undefined?((address-eqBase)%3===0?0x07:0xff):(C.masks[address]??255);this.mem[address]=((this.mem[address]||0)&~mask)|(value&mask);}response[8]=action.nack?0:1;}
   if(action.mutate)action.mutate(this,response);
   queueMicrotask(()=>{this.active--;if(action.drop)return;if(action.wrongAddress){const wrong=Uint8Array.from(response);wrong[5]^=1;this.emit(wrong);}if(action.short)this.emit(response.slice(0,3));else this.emit(response);});
 }
}
module.exports={FakeHID,config,memory};

