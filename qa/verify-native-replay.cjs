/* Replays recorded real HID bytes. Explicitly not a fresh hardware test. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const T=require('../transport.js'),C=require('../codec.js'),S=require('../session.js'),D=require('../debug.js');
const [tracePath,output]=process.argv.slice(2);if(!tracePath)throw Error('Usage: verify-native-replay.cjs <commands.jsonl> [result.json]');
const trace=fs.readFileSync(tracePath,'utf8').trim().split(/\r?\n/).map(JSON.parse);let cursor=0;
class ReplayDevice{
 constructor(){this.vendorId=0x303a;this.productId=0x4004;this.opened=false;this.listeners=new Set();this.collections=[{usagePage:0xff00,usage:1,inputReports:[{reportId:0,items:[{reportSize:8,reportCount:10}]}],outputReports:[{reportId:0,items:[{reportSize:8,reportCount:10}]}]}];}
 async open(){this.opened=true;}async close(){this.opened=false;}
 addEventListener(name,fn){this.listeners.add(fn);}removeEventListener(name,fn){this.listeners.delete(fn);}
 async sendReport(id,buffer){
  assert.equal(id,0);const request=trace[cursor++];assert.equal(request.direction,'OUT');assert.deepEqual(Array.from(buffer),request.payload,'updated code changed the recorded request sequence');
  const reply=trace[cursor++];assert.equal(reply.direction,'IN');const data=Uint8Array.from(reply.payload);
  queueMicrotask(()=>{for(const fn of this.listeners)fn({reportId:0,data:new DataView(data.buffer)});});
 }
}
const result={mode:'Recorded actual HID-byte replay; NO hardware connection',startedAt:new Date().toISOString(),sourceHashes:Object.fromEntries(['codec.js','session.js','transport.js','debug.js'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',f))).digest('hex')]))};
(async()=>{const bridge=new T.HidBridge(new ReplayDevice()),session=new S.RegisterSession(bridge);try{
 await bridge.open();await bridge.getStatus();const before={...await session.readAll()};
 const value=(before[32]&7)|((((before[32]>>3)+1)%32)<<3);await session.writeOne(32,value);await session.restoreLast();
 assert.deepEqual(session.snapshot,before);
 const config=D.mutedS31Template(JSON.parse(fs.readFileSync(path.join(__dirname,'../AC101S-S31-ECM-Speaker-muted.json'),'utf8')),{lineDifferential:Boolean(before[38]&16)});
 const r=await session.apply(config,{profile:'AC101S',mclkHz:12288000,groups:['routing','eq','dynamics','clock']});if(r.writes)await session.restoreLast();
 assert.deepEqual(session.snapshot,before);await bridge.getStatus();assert.equal(cursor,trace.length);
 result.status='PASSED';result.reportEvents=trace.length;result.hidCommands=trace.length/2;result.allSelectedTargetBitsVerified=true;
 console.log('PASS final target-bit checks accept the complete actual S31 trace without changing any request bytes');
}catch(e){result.status='FAILED';result.error=e.message;console.error(e);process.exitCode=1;}finally{await bridge.close();result.completedAt=new Date().toISOString();if(output)fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));}})();
