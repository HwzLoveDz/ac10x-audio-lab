/* Optional real-device acceptance. Requires explicit paths; not part of npm test. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),readline=require('node:readline');
const T=require('../transport.js'),C=require('../codec.js'),D=require('../debug.js'),S=require('../session.js');
const args=Object.fromEntries(process.argv.slice(2).reduce((all,v,i,a)=>i%2?all:[...all,[v.replace(/^--/,''),a[i+1]]],[]));
for(const k of ['python','hid-module-dir','out'])if(!args[k])throw Error('Requires --python --hid-module-dir --out');
const out=path.resolve(args.out);fs.mkdirSync(out,{recursive:false});
const policy=path.join(out,'policy.json');fs.writeFileSync(policy,JSON.stringify({masks:C.masks,readAddresses:C.READ_ADDRESSES,maxDACValue:129}));
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
const E=require('../examples.js');
const result={test:'Actual defaultFirmware / codec / session through bounded native HID',browserWebHIDVerified:false,checks:[],defaultSettingsLeftReadyForPlayback:false};
const device=new NativeDevice(),log=fs.createWriteStream(path.join(out,'commands.jsonl'));
const bridge=new T.HidBridge(device,{timeoutMs:2000,onLog:e=>log.write(JSON.stringify(e)+'\n')}),session=new S.RegisterSession(bridge);
const check=(name,value)=>{assert.ok(value,name);result.checks.push(name);console.log('PASS '+name);};
(async()=>{try{
 await bridge.open();result.bridgeBefore=await bridge.getStatus();
 const before=await session.readAll();result.before=before;
 const seed=JSON.parse(fs.readFileSync(path.join(__dirname,'../AC101S-ECM-Speaker-muted.json'),'utf8'));
 const config=E.defaultFirmware(seed,{fixedAudio:true,lineDifferential:Boolean(before[38]&16)});
 const opt={groups:['routing','eq','dynamics','clock'],profile:'AC101S',mclkHz:12288000};
 check('all startup defaults already match before any host initialization',C.makePlan(config,before,opt).steps.length===0);
 const noOp=await session.apply(config,opt);
 check('default Quick Start is idempotent on freshly booted firmware with zero register writes',noOp.verified&&noOp.writes===0);
 await session.writeOne(28,0);await session.writeOne(79,session.snapshot[79]&~1);
 check('controlled muted nondefault EQ state is really present',session.snapshot[28]===0&&!(session.snapshot[79]&1));
 const restored=await session.apply(config,opt);result.restoreWrites=restored.writes;
 check('Quick Start restores clear-vocal EQ and default playback gain through real hardware',restored.verified&&session.snapshot[28]===129&&(session.snapshot[38]&15)===0&&(session.snapshot[79]&1)===1);
 check('complete restored default plan has no differences',C.makePlan(config,session.snapshot,opt).steps.length===0);
 check('microphone monitoring and digital return paths remain disabled',(session.snapshot[29]&3)===1&&(session.snapshot[19]&15)===5);
 result.bridgeAfter=await bridge.getStatus();
 check('clock and I2C/busy counters remain consistent',result.bridgeAfter.clockGate&&result.bridgeAfter.i2cErrorsLow8===result.bridgeBefore.i2cErrorsLow8&&result.bridgeAfter.busyLow8===result.bridgeBefore.busyLow8);
 result.after={...session.snapshot};result.defaultSettingsLeftReadyForPlayback=true;result.status='PASSED';
}catch(e){result.status='FAILED';result.error={message:e.message,code:e.code,details:e.details};process.exitCode=1;console.error(e);
}finally{
 try{await bridge.close();result.cleanup=device.cleanup;}catch(e){result.closeError=e.message;device.child?.kill();process.exitCode=1;}
 result.completedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));log.end();console.log(JSON.stringify({status:result.status,checks:result.checks.length,cleanup:result.cleanup,defaultSettingsLeftReadyForPlayback:result.defaultSettingsLeftReadyForPlayback}));
}})();

