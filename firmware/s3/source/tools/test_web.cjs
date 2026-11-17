/* Offline contract/DOM tests only. Mock HID objects never touch native WebHID. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require(require.resolve('jsdom',{paths:[path.resolve(__dirname,'../..')]}));
const root = path.resolve(__dirname,'..');
const T = require('../web/transport.js');
const checks = [];
class FakeHID {
  constructor({pid=0x4005, vendor=0x303a, bytes=10, protocol=1}={}) {
    this.productId=pid; this.vendorId=vendor; this.productName='OFFLINE S3 MOCK'; this.opened=false;
    this.collections=[{usagePage:0xff00,usage:1,outputReports:[{reportId:0,items:[{reportSize:8,reportCount:bytes}]}],inputReports:[{reportId:0,items:[{reportSize:8,reportCount:bytes}]}]}];
    this.events=new Map(); this.sent=[]; this.mem={0:0x12}; this.gate=1; this.protocol=protocol;
    this.drop=false; this.nack=false; this.mismatch=false; this.playing=false; this.active=0; this.maxActive=0;
  }
  async open(){this.opened=true;}
  async close(){this.opened=false;}
  addEventListener(name,fn){if(!this.events.has(name))this.events.set(name,new Set());this.events.get(name).add(fn);}
  removeEventListener(name,fn){this.events.get(name)?.delete(fn);}
  emit(response, reportId=0){const a=Uint8Array.from(response); for(const f of this.events.get('inputreport')||[])f({reportId,data:new DataView(a.buffer)});}
  async sendReport(id, payload) {
    assert.equal(id,0); assert(this.opened);
    const q=Uint8Array.from(payload); this.sent.push(Array.from(q)); assert.equal(q.length,10);
    this.active++; this.maxActive=Math.max(this.maxActive,this.active);
    const r=new Uint8Array(10); r[0]=q[0]; r[1]=1;
    if(q[0]===0x7e) r.set([0x7e,1,0,this.protocol,this.gate,this.playing?1:0,0,0,1,0]);
    else if(q[0]===2){this.gate=q[2];r[2]=q[2];r[8]=1;}
    else if(q[0]===1){r[2]=this.mem[q[4]]||0;r[5]=q[4];r[6]=1;r[7]=this.nack?0:1;r[8]=q[2];}
    else if(q[0]===0){if(!this.nack&&!this.mismatch)this.mem[q[4]]=q[5];r[5]=q[4];r[6]=1;r[7]=q[2];r[8]=this.nack?0:1;}
    else throw Error('Unexpected command in fake');
    queueMicrotask(()=>{this.active--;if(!this.drop)this.emit(r);});
  }
}
function pass(message){checks.push(message);console.log('PASS '+message);}
async function rejected(work, code){await assert.rejects(work,e=>e.code===code);}
async function transportTests() {
  for(const pid of [0x4004,0x4005]) {const d=new FakeHID({pid}),b=new T.HidBridge(d);await b.open();assert.equal(d.sent.length,0);await b.getStatus();await b.close();}
  pass('S3/S31 open/status; open emits no writes');
  await rejected(()=>new T.HidBridge(new FakeHID({pid:0x9999})).open(),'DEVICE');
  await rejected(()=>new T.HidBridge(new FakeHID({bytes:64})).open(),'DESCRIPTOR');
  pass('unknown PID and incorrect S3 report sizes rejected');
  const d=new FakeHID(),b=new T.HidBridge(d,{timeoutMs:25});await b.open();
  assert.equal(await b.readRegister(0),0x12);assert.equal(d.sent[0][2],0x66);
  await Promise.all([b.readRegister(0),b.readRegister(1),b.writeRegister(0x38,0x55)]);
  assert.equal(d.maxActive,1);assert.equal(d.mem[0x38],0x55);
  await b.setMclk(false);assert.equal((await b.getStatus()).clockGate,false);
  assert.equal((await b.getStatus()).protocolVersion,'0.1');
  pass('I2C 7-bit 33 -> wire66; queued read/write/readback; clock ack and protocol0.1');
  d.nack=true;await rejected(()=>b.readRegister(0),'I2C_NACK');assert.equal(b.fault,null);d.nack=false;
  assert.equal(await b.readRegister(0),0x12);
  pass('I2C NACK reported without silent retry');
  d.drop=true;await rejected(()=>b.readRegister(0),'TIMEOUT');d.emit([1,1,0x12,0,0,0,1,1,0x66,0]);
  const before=d.sent.length;await rejected(()=>b.readRegister(1),'DESYNC');assert.equal(d.sent.length,before);await b.close();
  pass('timeout/late response quarantines connection; no subsequent transaction');
}
async function dom() {
  const d=new FakeHID();let chooser=0;
  const html=fs.readFileSync(path.join(root,'web/AC10x-S3-Bridge-v0.3.0.html'),'utf8');
  const page=new JSDOM(html,{runScripts:'dangerously',url:'https://offline.test/',beforeParse(window){
    Object.defineProperty(window.navigator,'hid',{value:{async requestDevice(options){chooser++;assert.equal(options.filters[0].productId,0x4005);return[d];},addEventListener(){},removeEventListener(){}}});
  }});
  const doc=page.window.document;
  const idle=async()=>{for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,1));if(!doc.getElementById('connect').disabled)return;}throw Error('UI did not become idle');};
  async function click(id){const el=doc.getElementById(id);assert(!el.disabled,id+' disabled unexpectedly');el.click();await idle();}
  assert.equal(d.sent.length,0);assert.equal(chooser,0);assert(doc.getElementById('write').disabled);
  await click('connect');assert.equal(d.sent.length,1);assert.equal(d.sent[0][0],0x7e);assert(doc.getElementById('write').disabled);
  await click('readId');assert.match(doc.getElementById('result').textContent,/0x12/);
  assert(d.sent.every(q=>q[0]!==0&&q[0]!==2));
  pass('standalone HTML: load/connection/status/ID have no writes or clock changes');
  const arm=doc.getElementById('armed');arm.checked=true;arm.dispatchEvent(new page.window.Event('change'));
  doc.getElementById('register').value='38';doc.getElementById('value').value='55';
  await click('write');assert.match(doc.getElementById('result').textContent,/读回一致/);assert.equal(d.mem[0x38],0x55);
  d.mismatch=true;doc.getElementById('value').value='56';await click('write');assert.match(doc.getElementById('result').textContent,/读回不一致/);d.mismatch=false;
  pass('explicit write/readback and mismatch reporting');
  d.playing=true;let n=d.sent.length;await click('gateOff');assert.match(doc.getElementById('result').textContent,/先停止/);assert(d.sent.slice(n).every(q=>q[0]!==2));d.playing=false;
  await click('gateOff');assert.equal(d.gate,0);await click('disconnect');assert(!arm.checked);assert(doc.getElementById('write').disabled);
  pass('active audio blocks clock switch; disconnect clears write permission');
  d.protocol=2;const protocolStart=d.sent.length;await click('connect');assert(doc.getElementById('write').disabled);assert(!arm.checked);assert.match(doc.getElementById('result').textContent,/协议\s*0\.1/);assert(d.sent.slice(protocolStart).every(q=>q[0]===0x7e));
  pass('unknown protocol fails closed');
  page.window.close();
}
(async()=>{
  await transportTests();await dom();
  const result={result:'PASS',firmwareVersion:'0.3.0',checks,hardware:'NOT OPENED; simulated HID only',webSourceSHA256:require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'web/AC10x-S3-Bridge-v0.3.0.html'))).digest('hex')};
  fs.writeFileSync(path.join(root,'evidence/web-tests.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
