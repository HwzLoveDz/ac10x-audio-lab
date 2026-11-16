/* Optional real-device acceptance. Requires explicit paths; not part of npm test. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),readline=require('node:readline');
const T=require('../transport.js'),C=require('../codec.js'),D=require('../debug.js'),S=require('../session.js');
const args=Object.fromEntries(process.argv.slice(2).reduce((all,v,i,a)=>i%2?all:[...all,[v.replace(/^--/,''),a[i+1]]],[]));
for(const k of ['python','hid-module-dir','out'])if(!args[k])throw Error('Requires --python --hid-module-dir --out');
const out=path.resolve(args.out);fs.mkdirSync(out,{recursive:false});
const policy=path.join(out,'policy.json');fs.writeFileSync(policy,JSON.stringify({masks:C.masks,readAddresses:C.READ_ADDRESSES,maxDACValue:129,maxWrites:600}));
class NativeDevice{
 constructor(){this.vendorId=0x303a;this.productId=0x4004;this.productName='S31 native acceptance';this.opened=false;this.listeners=new Set();this.counter=0;this.pending=new Map();this.collections=[{usagePage:0xff00,usage:1,inputReports:[{reportId:0,items:[{reportSize:8,reportCount:10}]}],outputReports:[{reportId:0,items:[{reportSize:8,reportCount:10}]}]}];}
 rpc(op,extra={}){return new Promise((resolve,reject)=>{const id=++this.counter,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('NATIVE_RPC_TIMEOUT'));},2500);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({id,op,...extra})+'\n');});}
 async open(){
  this.child=spawn(args.python,[path.join(__dirname,'native-default-hid-server.py'),'--policy',policy,'--hid-module-dir',args['hid-module-dir']],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  this.child.stderr.on('data',b=>fs.appendFileSync(path.join(out,'backend-stderr.log'),b));
  readline.createInterface({input:this.child.stdout}).on('line',line=>{try{const r=JSON.parse(line),p=this.pending.get(r.id);if(p){this.pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error(r.error)):p.resolve(r.value);}}catch(e){console.error('Backend output error',e.message);}});
  this.child.on('error',e=>this.fail(e));this.child.on('exit',code=>this.fail(Error('BACKEND_EXIT_'+code)));
  this.identity=await this.rpc('open');this.productName=this.identity.productName;this.opened=true;
 }
 fail(e){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(e);}this.pending.clear();}
 addEventListener(name,fn){if(name==='inputreport')this.listeners.add(fn);}
 removeEventListener(name,fn){this.listeners.delete(fn);}
 async sendReport(id,buffer){assert.equal(id,0);const value=await this.rpc('send',{payload:Array.from(buffer)}),data=Uint8Array.from(value);for(const fn of this.listeners)fn({reportId:0,data:new DataView(data.buffer)});}
 async close(){try{this.cleanup=await this.rpc('close');}finally{this.opened=false;this.child.stdin.end();}}
}

const E=require('../examples.js'),result={test:'All eight production Quick Start examples through bounded native S31 HID',hardwareAccessed:true,firmwareFlashed:false,audioStreamsOpened:0,microphoneCaptured:false,rows:[],checks:[],defaultSettingsLeftReadyForPlayback:false};
const device=new NativeDevice(),log=fs.createWriteStream(path.join(out,'commands.jsonl'));
const bridge=new T.HidBridge(device,{timeoutMs:2000,onLog:e=>log.write(JSON.stringify(e)+'\n')}),session=new S.RegisterSession(bridge);
let baseline=null;const opt={groups:['routing','eq','dynamics','clock'],profile:'AC101S',mclkHz:12288000};
(async()=>{try{
 await bridge.open();result.bridgeBefore=await bridge.getStatus();const before=await session.readAll();
 const seed=require('../AC101S-S31-ECM-Speaker-muted.json');baseline=E.defaultFirmware(seed,{fixedAudio:true,lineDifferential:Boolean(before[38]&16)});
 assert.equal(C.makePlan(baseline,before,opt).steps.length,0,'Current hardware must already match the user-accepted default');result.before={...before};
 for(const meta of E.quickExamples){const config=E.quickExample(meta.id,baseline,{fixedAudio:true,lineDifferential:Boolean(before[38]&16)}),applied=await session.apply(config,opt);assert.ok(applied.verified);assert.equal(C.makePlan(config,session.snapshot,opt).steps.length,0,meta.id);result.rows.push({id:meta.id,name:meta.name,verified:true,writes:applied.writes,snapshot:{...session.snapshot}});console.log('PASS native example '+meta.id+' writes='+applied.writes);}
 const restored=await session.apply(baseline,opt);assert.ok(restored.verified);assert.equal(C.makePlan(baseline,session.snapshot,opt).steps.length,0);result.after={...session.snapshot};result.defaultSettingsLeftReadyForPlayback=true;
 result.bridgeAfter=await bridge.getStatus();assert.equal(result.bridgeAfter.i2cErrorsLow8,result.bridgeBefore.i2cErrorsLow8);assert.equal(result.bridgeAfter.busyLow8,result.bridgeBefore.busyLow8);assert.ok(result.bridgeAfter.clockGate);
 const repeat=await session.apply(baseline,opt);assert.equal(repeat.writes,0);result.checks=['Eight production configurations each fully read back','Default restored with normal 0dB playback and clear-vocal EQ','Repeated default performs zero extra writes','Clock and I2C/busy status remain consistent'];result.status='PASSED';
}catch(e){result.status='FAILED';result.error={message:e.message,code:e.code,details:e.details};process.exitCode=1;console.error(e);
}finally{
 if(baseline&&!result.defaultSettingsLeftReadyForPlayback&&session.snapshot&&!session.stale&&!session.busy){try{const r=await session.apply(baseline,opt);result.defaultSettingsLeftReadyForPlayback=r.verified;}catch(e){result.restorationError=e.message;}}
 try{await bridge.close();result.cleanup=device.cleanup;}catch(e){result.closeError=e.message;device.child?.kill();process.exitCode=1;}
 result.completedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));log.end();console.log(JSON.stringify({status:result.status,examples:result.rows.length,checks:result.checks.length,cleanup:result.cleanup,defaultSettingsLeftReadyForPlayback:result.defaultSettingsLeftReadyForPlayback}));
}})();
