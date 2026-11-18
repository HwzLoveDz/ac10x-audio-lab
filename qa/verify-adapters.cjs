/* Software-only adapter matrix and byte parity against the prior release. */
const assert=require('node:assert/strict'),T=require('../transport.js'),C=require('../codec.js'),S=require('../session.js'),D=require('../debug.js'),{FakeHID,config,memory}=require('./fake-hid.cjs');
let count=0;async function test(name,fn){await fn();count++;console.log('PASS '+name);}
function device(kind='S3',options={}){const d=new FakeHID({bytes:kind==='TI'?64:10,...options});if(kind!=='TI'){d.vendorId=0x303a;d.productId=kind==='S3'?0x4005:0x4004;}return d;}
async function opened(options={}){const d=device('S3',options),b=new T.HidBridge(d,{timeoutMs:25});await b.open();return{d,b,s:new S.RegisterSession(b)};}
(async()=>{
await test('one adapter registry distinguishes TI/S31/S3 identities, capabilities and picker filters',()=>{
 assert.deepEqual(T.deviceFilters().map(f=>[f.vendorId,f.productId,f.usagePage]),[[0x0451,0x4822,undefined],[0x303a,0x4004,0xff00],[0x303a,0x4005,0xff00]]);
 for(const kind of ['TI','S31','S3']){const d=device(kind),p=T.adapterProfile(d),info=D.adapterInfo(d);assert.equal(p.kind,kind);assert.equal(info.kind,kind);assert.equal(info.statusQuery,kind!=='TI');assert.equal(p.fixedAudio,kind!=='TI');}
 assert.equal(T.adapterProfile({vendorId:0x303a,productId:0x4006}),null);assert.ok(Object.isFrozen(T.ADAPTERS[2]));const filters=T.deviceFilters();filters[2].productId=0;assert.equal(T.deviceFilters()[2].productId,0x4005);
});
await test('S3 rejects wrong report IDs and asymmetric report lengths before opening',async()=>{
 for(const mutate of [d=>d.collections[0].inputReports[0].reportId=1,d=>d.collections[0].outputReports[0].reportId=1,d=>d.collections[0].inputReports[0].items[0].reportCount=11,d=>d.collections[0].outputReports[0].items[0].reportCount=9]){const d=device();mutate(d);await assert.rejects(new T.HidBridge(d).open(),e=>e.code==='DESCRIPTOR');assert.equal(d.opened,false);assert.equal(d.sent.length,0);}
});
await test('S3 open/status/ID are read-only; queued writes, gate ack and 7-bit I2C encoding match protocol',async()=>{
 const {d,b}=await opened();assert.equal(d.sent.length,0);assert.equal((await b.getStatus()).protocolVersion,'0.1');assert.equal(await b.readRegister(0),0x12);assert.equal(d.writes,0);
 assert.deepEqual(await Promise.all([b.writeRegister(32,0x69),b.readRegister(32)]),[0x69,0x69]);assert.equal(d.maxActive,1);assert.ok(d.sent.filter(r=>[0,1].includes(r.command)).every(r=>r.payload[2]===0x66));await b.setMclk(false);assert.equal(d.sent.at(-1).payload[2],0);await b.close();
});
await test('S3 NACK remains recoverable without retry; mismatched echoes quarantine after timeout',async()=>{
 const {d,b}=await opened();d.hook=()=>({nack:true});await assert.rejects(b.readRegister(0),e=>e.code==='I2C_NACK');assert.equal(d.sent.length,1);assert.equal(b.fault,null);d.hook=null;assert.equal(await b.readRegister(0),0x12);
 d.hook=r=>r.command===0?{mutate:(dev,p)=>p[5]^=1}:{};await assert.rejects(b.writeRegister(32,0x61),e=>e.code==='TIMEOUT');const n=d.sent.length;d.emit([0,1,0,0,0,32,1,0x66,1,0]);await assert.rejects(b.readRegister(0),e=>e.code==='DESYNC');assert.equal(d.sent.length,n);await b.close();
});
await test('S3 invalid status, unknown protocol, short reply and failed gate cannot authorize later traffic',async()=>{
 for(const [command,mutate,code] of [[126,(d,p)=>p[3]=2,'PROTOCOL_VERSION'],[126,(d,p)=>p[4]=3,'STATUS_RESPONSE'],[2,(d,p)=>p[8]=0,'GATE_REJECTED']]){const {d,b}=await opened({hook:r=>r.command===command?{mutate}:{}});await assert.rejects(command===2?b.setMclk(true):b.getStatus(),e=>e.code===code);assert.equal(b.fault.code,code);await assert.rejects(b.readRegister(0),e=>e.code==='DESYNC');assert.equal(d.sent.length,1);await b.close();}
 const {d,b}=await opened({hook:()=>({short:true})});await assert.rejects(b.readRegister(0),e=>e.code==='SHORT_REPORT');assert.equal(b.fault.code,'SHORT_REPORT');await b.close();
});
await test('S3 disconnect rejects in-flight reads; reopening does not replay writes',async()=>{
 const {d,b}=await opened({hook:()=>({drop:true})});const pending=b.readRegister(0);await new Promise(setImmediate);b.disconnected();await assert.rejects(pending,e=>e.code==='DISCONNECTED');await b.close();d.hook=null;const n=d.sent.length;await b.open();assert.equal(d.sent.length,n);assert.equal(await b.readRegister(0),0x12);assert.equal(d.writes,0);await b.close();
});
await test('S3 fixed audio policy blocks invalid clock/register writes, including the raw mirror API',async()=>{
 const {d,b,s}=await opened(),c=D.mutedBridgeTemplate(config());
 for(const change of [{fs:44100},{bits:24},{slot:16},{slots:1},{format:'LJ'},{role:'master'}]){const bad=structuredClone(c);Object.assign(bad.clock,change);await assert.rejects(s.apply(bad,{groups:['clock'],mclkHz:12288000}),/桥接音频/);}
 await assert.rejects(s.apply(c,{groups:['clock'],mclkHz:12000000}),/桥接音频/);await assert.rejects(s.writeOne(4,4),/桥接音频/);assert.equal(d.sent.length,0);c.raw={4:4};await assert.rejects(s.apply(c,{groups:['manual']}),/桥接音频/);assert.equal(d.writes,0);assert.ok(d.sent.every(r=>r.command===1));assert.doesNotThrow(()=>C.assertAdapterRegister(7,0x16,d));await b.close();
});
await test('S3 masked apply/undo and diagnostics preserve model ownership and use the same format diagnostic on both targets',async()=>{
 const {d,b,s}=await opened();Object.assign(d.mem,{12:0x73,13:0,28:0});const before={...d.mem};await s.readAll();const c=D.mutedBridgeTemplate(config());c.pga=16;const r=await s.apply(c,{groups:['routing'],scope:'pga',profile:'AC101S',mclkHz:12288000});assert.ok(r.verified);assert.equal(d.mem[32]&7,before[32]&7);await s.restoreLast();assert.deepEqual(d.mem,before);
 const diagnose=kind=>D.diagnose(d.mem,{stale:false,adapter:D.adapterInfo(device(kind))});assert.deepEqual(diagnose('S3'),diagnose('S31'));assert.ok(diagnose('S3').some(x=>x.id==='bridge-format'&&x.severity==='ok'));await b.close();
});
const fixtures=require('./fixtures/legacy-adapter-parity.json');
for(const f of fixtures.cases)await test(f.kind+' legacy request bytes and final state match, with the documented S31 register-6 pipeline-clock correction',async()=>{
 const d=device(f.kind,{mem:f.initial}),b=new T.HidBridge(d),s=new S.RegisterSession(b);await b.open();await s.readAll();if(f.kind==='S31')await b.getStatus();await s.writeOne(32,0x71);await s.restoreLast();
 const r=await s.apply(f.draft,{profile:f.kind==='S31'?'AC101S':'AC102',mclkHz:12288000,groups:['routing','eq','dynamics','clock']});if(r.writes)await s.restoreLast();await b.setMclk(false);await b.setMclk(true);await b.close();const actual=d.sent.map(r=>({id:r.id,payload:r.payload}));if(f.kind==='S31'){const withoutSystemClock=reports=>reports.filter(r=>!([0,1].includes(r.payload[0])&&r.payload[3]===0&&r.payload[4]===6));assert.deepEqual(withoutSystemClock(actual),withoutSystemClock(f.reports));assert.ok(d.sent.filter(r=>r.command===0&&r.address===6).every(r=>(r.value&10)===10),'active ADC/DAC pipeline clocks cannot be cleared');}else assert.deepEqual(actual,f.reports);assert.deepEqual(d.mem,f.final);
});
console.log(count+' adapter matrix/parity checks; simulated only, no hardware I/O');
})().catch(e=>{console.error(e);process.exitCode=1;});
