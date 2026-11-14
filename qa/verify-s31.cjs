const assert=require('node:assert/strict'),T=require('../transport.js'),{FakeHID}=require('./fake-hid.cjs');
let tests=0;async function test(n,f){await f();tests++;console.log('PASS '+n);}
function s31(options={}){const d=new FakeHID({bytes:10,...options});d.vendorId=0x303a;d.productId=0x4004;return d;}
(async()=>{
await test('S31 opens only exact 10-byte reports and reads ID without writes',async()=>{const d=s31(),b=new T.HidBridge(d);await b.open();assert.equal(await b.readRegister(0),0x12);assert.equal(d.writes,0);await b.close();});
await test('S31 rejects short and oversized reports before opening',async()=>{for(const bytes of [9,16]){const d=s31({bytes}),b=new T.HidBridge(d);await assert.rejects(b.open(),e=>e.code==='DESCRIPTOR');assert.equal(d.opened,false);assert.equal(d.sent.length,0);}});
await test('unknown VID or PID never opens',async()=>{for(const [v,p] of [[0x1234,0x4004],[0x303a,0x4006]]){const d=s31();d.vendorId=v;d.productId=p;await assert.rejects(new T.HidBridge(d).open(),e=>e.code==='DEVICE');assert.equal(d.opened,false);}});
await test('S31 gate requires positive status byte',async()=>{const d=s31({hook:r=>({mutate:(dev,p)=>{if(r.command===2)p[8]=1;}})}),b=new T.HidBridge(d);await b.open();assert.equal((await b.setMclk(true)).acknowledged,true);assert.equal(d.sent[0].payload[2],1);await b.close();});
await test('S31 failed gate faults connection and blocks later writes',async()=>{const d=s31({hook:r=>r.command===2?{mutate:(dev,p)=>p[8]=0}:{}}),b=new T.HidBridge(d);await b.open();await assert.rejects(b.setMclk(true),e=>e.code==='GATE_REJECTED');await assert.rejects(b.writeRegister(2,1),e=>e.code==='DESYNC');assert.equal(d.writes,0);await b.close();});
await test('TI keeps its original variable-report and gate response behavior',async()=>{const d=new FakeHID({bytes:64}),b=new T.HidBridge(d);await b.open();assert.equal((await b.setMclk(true)).acknowledged,true);assert.equal(await b.readRegister(0),0x12);await b.close();});
console.log(tests+' S31 adapter checks passed; simulated, no hardware I/O');
})().catch(e=>{console.error(e);process.exitCode=1;});
