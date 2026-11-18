/* Optional real-device acceptance. Requires explicit paths; not part of npm test. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),readline=require('node:readline');
const T=require('../transport.js'),C=require('../codec.js'),D=require('../debug.js'),S=require('../session.js');
const args=Object.fromEntries(process.argv.slice(2).reduce((all,v,i,a)=>i%2?all:[...all,[v.replace(/^--/,''),a[i+1]]],[]));
for(const k of ['python','hid-module-dir','out'])if(!args[k])throw Error('Requires --python --hid-module-dir --out');
const out=path.resolve(args.out);fs.mkdirSync(out,{recursive:false});
const policy=path.join(out,'policy.json');fs.writeFileSync(policy,JSON.stringify({masks:C.masks,readAddresses:C.READ_ADDRESSES}));
class NativeDevice{
 constructor(){this.vendorId=0x303a;this.productId=0x4004;this.productName='S31 native acceptance';this.opened=false;this.listeners=new Set();this.counter=0;this.pending=new Map();this.collections=[{usagePage:0xff00,usage:1,inputReports:[{reportId:0,items:[{reportSize:8,reportCount:10}]}],outputReports:[{reportId:0,items:[{reportSize:8,reportCount:10}]}]}];}
 rpc(op,extra={}){return new Promise((resolve,reject)=>{const id=++this.counter,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('NATIVE_RPC_TIMEOUT'));},2500);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({id,op,...extra})+'\n');});}
 async open(){
  this.child=spawn(args.python,[path.join(__dirname,'native-hid-server.py'),'--policy',policy,'--hid-module-dir',args['hid-module-dir']],{windowsHide:true,stdio:['pipe','pipe','pipe']});
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
const result={startedAt:new Date().toISOString(),test:'Actual release JS transport/codec/session through bounded native Windows HID backend',browserWebHIDVerified:false,checks:[]};
const device=new NativeDevice(),log=fs.createWriteStream(path.join(out,'commands.jsonl'));
const bridge=new T.HidBridge(device,{timeoutMs:2000,onLog:e=>log.write(JSON.stringify(e)+'\n')}),session=new S.RegisterSession(bridge);
const check=(name,value)=>{assert.ok(value,name);result.checks.push(name);console.log('PASS '+name);};
const same=(a,b)=>C.READ_ADDRESSES.every(k=>a[k]===b[k]);
(async()=>{try{
 await bridge.open();result.identity={...D.adapterInfo(device),...device.identity};
 result.bridgeBefore=await bridge.getStatus();check('clock enabled and no bridge error/busy count',result.bridgeBefore.clockGate&&!result.bridgeBefore.i2cErrorsLow8&&!result.bridgeBefore.busyLow8);
 const before={...await session.readAll()};result.before=before;check('104-register chip snapshot and DAC muted',Object.keys(before).length===C.READ_ADDRESSES.length&&before[0]===18&&before[28]===0);
 const changed=(before[32]&7)|((((before[32]>>3)+1)%32)<<3);
 await session.writeOne(32,changed);check('actual PGA step readback',session.snapshot[32]===changed);await session.restoreLast();check('PGA undo restores all read registers',same(before,session.snapshot));
 const config=D.mutedBridgeTemplate(JSON.parse(fs.readFileSync(path.join(__dirname,'../AC101S-ECM-Speaker-muted.json'),'utf8')),{lineDifferential:Boolean(before[38]&16)});
 const applied=await session.apply(config,{profile:'AC101S',mclkHz:12288000,groups:['routing','eq','dynamics','clock']});result.templateWrites=applied.writes;check('muted base template applies and verifies',applied.verified&&session.snapshot[28]===0&&!(session.snapshot[79]&1)&&!(session.snapshot[49]&0x18));
 if(applied.writes)await session.restoreLast();check('template undo restores all original registers',same(before,session.snapshot));
 result.bridgeAfter=await bridge.getStatus();check('bridge counters remain clear and clock remains enabled',!result.bridgeAfter.i2cErrorsLow8&&!result.bridgeAfter.busyLow8&&result.bridgeAfter.clockGate);
 result.after={...session.snapshot};result.history=session.history;result.status='PASSED';
}catch(e){result.status='FAILED';result.error={message:e.message,code:e.code,details:e.details};console.error(e);process.exitCode=1;
}finally{
 try{await bridge.close();result.cleanup=device.cleanup;}catch(e){result.closeError=e.message;device.child?.kill();process.exitCode=1;}
 result.completedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));log.end();console.log(JSON.stringify({status:result.status,out,checks:result.checks.length,cleanup:result.cleanup}));
}})();
