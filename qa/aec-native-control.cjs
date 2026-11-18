/* Optional real-device acceptance. Requires explicit paths; not part of npm test. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),readline=require('node:readline');
const T=require('../transport.js'),C=require('../codec.js'),D=require('../debug.js'),S=require('../session.js');
const args=Object.fromEntries(process.argv.slice(2).reduce((all,v,i,a)=>i%2?all:[...all,[v.replace(/^--/,''),a[i+1]]],[]));
for(const k of ['python','hid-module-dir','out'])if(!args[k])throw Error('Requires --python --hid-module-dir --out');
const target=args.target||'esp32s3',productId={esp32s3:0x4005,esp32s31:0x4004}[target];
assert.ok(productId,'--target must be esp32s3 or esp32s31');
const out=path.resolve(args.out);fs.mkdirSync(out,{recursive:false});
const policy=path.join(out,'policy.json');fs.writeFileSync(policy,JSON.stringify({masks:C.masks,readAddresses:C.READ_ADDRESSES,maxDACValue:129,maxWrites:600}));
class NativeDevice{
 constructor(){this.vendorId=0x303a;this.productId=productId;this.productName=target;this.opened=false;this.listeners=new Set();this.counter=0;this.pending=new Map();this.collections=[{usagePage:0xff00,usage:1,inputReports:[{reportId:0,items:[{reportSize:8,reportCount:10}]}],outputReports:[{reportId:0,items:[{reportSize:8,reportCount:10}]}]}];}
 rpc(op,extra={}){return new Promise((resolve,reject)=>{const id=++this.counter,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('NATIVE_RPC_TIMEOUT'));},op==='open'?12000:2500);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({id,op,...extra})+'\n');});}
 async open(){
  this.child=spawn(args.python,[path.join(__dirname,'aec-native-hid-server.py'),'--policy',policy,'--hid-module-dir',args['hid-module-dir'],'--target',target],{windowsHide:true,stdio:['pipe','pipe','pipe']});
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


const E=require('../examples.js'),mode=args.mode||'enable',inputMode=args.input||'analog',result={mode,inputMode,rows:[]};
assert.ok(['enable','default'].includes(mode),'--mode must be enable or default');assert.ok(['analog','dmic'].includes(inputMode),'--input must be analog or dmic');
const device=new NativeDevice(),bridge=new T.HidBridge(device,{timeoutMs:2000}),session=new S.RegisterSession(bridge);
const opt={groups:['routing','eq','dynamics','clock'],profile:'AC101S',mclkHz:12288000};let baseline,touched=false;
(async()=>{try{
 await bridge.open();result.capabilities=await bridge.getCapabilities();const state=await session.readAll();baseline=E.defaultFirmware(require('../AC101S-ECM-Speaker-muted.json'),{inputMode,fixedAudio:true,lineDifferential:Boolean(state[38]&16)});
 const cfg=mode==='default'?baseline:E.quickExample('aec-call',baseline,{inputMode,fixedAudio:true,lineDifferential:Boolean(state[38]&16)});
 C.assertAdapterClock(cfg,opt,device);C.makePlan(cfg,state,opt);
 result.before=await bridge.getAEC();
 if(mode==='enable')assert.ok(result.before.supported,'The selected bridge has no AEC capability');
 touched=true;
 if(result.before.supported)await bridge.setAEC(false);
 const applied=await session.apply(cfg,opt);assert.equal(C.makePlan(cfg,session.snapshot,opt).steps.length,0);
 if(mode==='enable')await bridge.setAEC(true);
 result.after=await bridge.getAEC();result.bridge=await bridge.getStatus();result.snapshot={...session.snapshot};result.writes=applied.writes;
 assert.equal(result.after.enabled,mode==='enable');result.status='PASS';
}catch(e){result.status='FAILED';result.error={message:e.message,code:e.code,details:e.details};if(touched&&baseline&&bridge.connected&&!bridge.fault){try{if(result.before.supported)await bridge.setAEC(false);await session.apply(baseline,opt);result.restoredDefault=true;}catch(x){result.restoreError=x.message;}}process.exitCode=1;
}finally{try{await bridge.close();result.cleanup=device.cleanup;}catch(e){result.closeError=e.message;device.child?.kill();}device.child?.stdin.end();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));}})();
