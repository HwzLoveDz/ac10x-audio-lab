/* Optional real-device acceptance. Requires explicit paths; not part of npm test. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),readline=require('node:readline');
const T=require('../transport.js'),C=require('../codec.js'),D=require('../debug.js'),S=require('../session.js');
const args=Object.fromEntries(process.argv.slice(2).reduce((all,v,i,a)=>i%2?all:[...all,[v.replace(/^--/,''),a[i+1]]],[]));
for(const k of ['python','hid-module-dir','out'])if(!args[k])throw Error('Requires --python --hid-module-dir --out');
const out=path.resolve(args.out);fs.mkdirSync(out,{recursive:false});
const policy=path.join(out,'policy.json');fs.writeFileSync(policy,JSON.stringify({masks:C.masks,readAddresses:C.READ_ADDRESSES,maxDACValue:93}));
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
const result={test:'Actual v0.8.8 EQ Off/voice acoustic A/B through its codec/session and bounded native HID',browserWebHIDVerified:false,checks:[],defaultSettingsLeftReadyForPlayback:false};
const device=new NativeDevice(),log=fs.createWriteStream(path.join(out,'commands.jsonl'));
const bridge=new T.HidBridge(device,{timeoutMs:2000,onLog:e=>log.write(JSON.stringify(e)+'\n')}),session=new S.RegisterSession(bridge);
const check=(name,value)=>{assert.ok(value,name);result.checks.push(name);console.log('PASS '+name);};

let config;
async function audio(label){
 const dir=path.join(out,label),child=spawn(args.python,[path.join(__dirname,'audio-bypass-probe.py'),dir,label],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let audioText='',lastPoll=Promise.resolve();const gain=[];
 child.stdout.on('data',b=>{audioText+=b;process.stdout.write(b);});child.stderr.on('data',b=>fs.appendFileSync(path.join(out,label+'-stderr.log'),b));
 const timer=setInterval(()=>{lastPoll=lastPoll.then(async()=>{const value=await session.readOne(48);gain.push({at:Date.now(),AGCAppliedGainRegister:value});}).catch(e=>{gain.push({error:e.message});});},1000);
 let kill;try{await new Promise((resolve,reject)=>{kill=setTimeout(()=>{child.kill();reject(Error('AUDIO_CHILD_DEADLINE'));},35000);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('AUDIO_CHILD_EXIT_'+code)));});}
 finally{clearTimeout(kill);clearInterval(timer);await lastPoll;fs.writeFileSync(path.join(out,label+'-audio.log'),audioText);fs.writeFileSync(path.join(out,label+'-gain.json'),JSON.stringify(gain,null,2));}
 const data=JSON.parse(fs.readFileSync(path.join(dir,'audio.json'),'utf8'));check(label+' audio complete with no callback warnings',data.status==='AUDIO_CAPTURE_COMPLETED'&&!data.warnings.length&&data.allAudioHandlesClosed);
}
(async()=>{try{
 await bridge.open();result.bridgeBefore=await bridge.getStatus();const before=await session.readAll();result.before=before;
 const seed=JSON.parse(fs.readFileSync(path.join(__dirname,'../AC101S-ECM-Speaker-muted.json'),'utf8'));
 config=E.defaultFirmware(seed,{fixedAudio:true,lineDifferential:Boolean(before[38]&16)});
 const opt={groups:['eq'],profile:'AC101S',mclkHz:12288000};
 check('existing default voice plan is already exact before native acceptance',C.makePlan(config,before,{...opt,groups:['routing','eq','dynamics','clock']}).steps.length===0);
 result.phases=[];
 for(const [label,enabled]of [['voice-before',true],['eq-off',false],['voice-after',true]]){
  const c=JSON.parse(JSON.stringify(config));c.eq.enabled=enabled;const applied=await session.apply(c,opt);
  check(label+' actual session verified the complete target',applied.verified&&(session.snapshot[79]&1)===Number(enabled));
  if(!enabled){check('Off physical coefficients are exact unity with zero pre-gain',C.decodeEq(session.snapshot).every(b=>b.every((v,i)=>v===(i===0?1:0))));const noOp=await session.apply(c,opt);check('repeat Off performs zero writes',noOp.writes===0);}
  result.phases.push({label,enabled,snapshot:{...session.snapshot},writes:applied.writes});
  await audio(label);
 }
 result.bridgeAfter=await bridge.getStatus();check('native run retains clocks and error counters',result.bridgeAfter.clockGate&&result.bridgeAfter.i2cErrorsLow8===result.bridgeBefore.i2cErrorsLow8&&result.bridgeAfter.busyLow8===result.bridgeBefore.busyLow8);
 result.status='PASSED';
}catch(e){result.status='FAILED';result.error={message:e.message,code:e.code,details:e.details};console.error(e);process.exitCode=1;}
finally{
 try{if(config&&device.opened){await session.apply(config,{groups:['routing','eq','dynamics','clock'],profile:'AC101S',mclkHz:12288000});result.defaultSettingsLeftReadyForPlayback=C.makePlan(config,session.snapshot,{groups:['routing','eq','dynamics','clock'],profile:'AC101S',mclkHz:12288000}).steps.length===0;result.after={...session.snapshot};}}catch(e){result.restoreError=e.message;process.exitCode=1;}
 try{await bridge.close();result.cleanup=device.cleanup;}catch(e){result.closeError=e.message;device.child?.kill();process.exitCode=1;}
 result.completedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));log.end();console.log(JSON.stringify({status:result.status,checks:result.checks.length,cleanup:result.cleanup,defaultSettingsLeftReadyForPlayback:result.defaultSettingsLeftReadyForPlayback}));
}})();
