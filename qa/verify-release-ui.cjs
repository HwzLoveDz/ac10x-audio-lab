const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const {FakeHID}=require('./fake-hid.cjs');
let checks=0;
const pass=name=>{checks++;console.log('PASS '+name);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function make(){
 const device=new FakeHID({bytes:10});device.vendorId=0x303a;device.productId=0x4004;
 Object.assign(device.mem,{12:0x73,13:0,28:0});
 const errors=[],blobs=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../AC10x-Audio-Lab.html'),'utf8'),{url:'https://qa.invalid/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.scrollTo=()=>{};w.URL.createObjectURL=b=>{blobs.push(b);return 'blob:qa';};w.URL.revokeObjectURL=()=>{};
  w.Blob=class{constructor(parts,options){this.parts=parts;this.type=options?.type;}};
  w.HTMLAnchorElement.prototype.click=function(){};
  Object.defineProperty(w.navigator,'hid',{value:{requestDevice:async()=>[device],addEventListener(){},removeEventListener(){}}});
 }});
 const w=dom.window,d=w.document,$=s=>d.querySelector(s);
 async function wait(f){const deadline=Date.now()+8000;while(!f()){if(Date.now()>deadline)throw Error('UI timeout: '+$('#hwStatus').textContent+' '+$('#toast').textContent);await sleep(10);}}
 function load(selector,value){const el=$(selector),text=typeof value==='string'?value:JSON.stringify(value);Object.defineProperty(el,'files',{configurable:true,value:[{name:'QA.json',size:text.length,text:async()=>text}]});el.dispatchEvent(new w.Event('change'));}
 async function click(selector){$(selector).click();await sleep(1);await wait(()=>!$('#hwRead').disabled);}
 $('#usbConnect').click();await wait(()=>d.body.dataset.hardware==='ready');
 return{w,d,$,device,errors,blobs,wait,load,click,close(){w.dispatchEvent(new w.Event('pagehide'));w.close();}};
}
(async()=>{
 let x=await make();try{
  const {w,$,device,wait,load,click,blobs}=x;
  const before=device.writes;
  const preset=JSON.parse(fs.readFileSync(path.join(__dirname,'../AC101S-ECM-Speaker-muted.json'),'utf8'));
  load('#configFile',preset);await wait(()=>/草稿已导入/.test($('#toast').textContent));assert.equal($('#hwProfile').value,'AC101S');assert.equal(device.writes,before);
  assert.equal($('#hwLoadS31Template'),null);assert.equal(w.AudioLab.getConfig().dac.mute,true);assert.equal(w.AudioLab.getConfig().hpf.enabled,false);assert.equal(device.writes,before);
  pass('own AC101S preset loads into the actual draft; redundant template button removed without hardware writes');
  $('#exportConfig').click();const document=JSON.parse(blobs.at(-1).parts.join(''));assert.equal(document.format,'AC10x-configuration');assert.equal(document.schemaVersion,1);assert.equal(w.AudioLab.validateConfig(document).profile,'AC101S');load('#configFile',document);await wait(()=>/草稿已导入/.test($('#toast').textContent));assert.equal(device.writes,before);
  pass('versioned configuration export reimports through the actual file handler without writes');
  await click('#hwQueryBridge');assert.match($('#hwBridgeStatus').textContent,/协议/);assert.deepEqual(device.sent.slice(-2).map(r=>r.command),[126,122]);assert.equal(device.writes,before);
  pass('explicit S31 status query uses read-only protocol and displays queried evidence');
  $('#hwSaveBaseline').click();device.mem[32]^=8;await click('#hwRead');assert.match($('#hwBaselineInfo').textContent,/1个地址变化/);assert.match($('#hwBaselineRows').textContent,/0x20/);
  load('#hwBaselineFile',{registers:{0:18,32:device.mem[32]}});await sleep(20);assert.match($('#hwBaselineInfo').textContent,/QA.json/);assert.equal(device.writes,before);
  pass('baseline capture, fresh diff and imported baseline are read-only');
  $('#hwRegAddress').value='20';$('#hwRegAddress').dispatchEvent(new w.Event('input'));$('#hwRegValue').value='69';await click('#hwWriteOne');assert.equal(device.mem[32],0x69); // current after external change may equal 0x69
  $('#hwRegValue').value='71';await click('#hwWriteOne');assert.equal(device.mem[32],0x71);assert.equal($('#hwRestoreLast').disabled,false);
  await click('#hwRestoreLast');assert.equal(device.mem[32],0x69);assert.equal($('#hwRestoreLast').disabled,true);
  pass('manual edit and explicit restore verify actual memory and consume the undo control');
  $('#hwLogExport').click();const log=JSON.parse(blobs.at(-1).parts.join(''));assert.equal(log.adapter.kind,'S31');assert.equal(log.adapter.vendorId,0x303a);assert.ok(log.events.length);
  $('#hwExportDebug').click();const bundle=JSON.parse(blobs.at(-1).parts.join(''));assert.equal(bundle.format,'AC10x-debug-bundle');assert.equal(bundle.adapter.kind,'S31');assert.ok(bundle.transactions.length);assert.equal(bundle.operationInProgress,false);assert.equal(bundle.snapshot[32],0x69);assert.ok(bundle.diagnostics.some(v=>v.evidence==='calculated'));assert.equal(w.AudioLab.validateConfig(bundle).profile,'AC101S');
  pass('exports use real adapter identity and diagnostic bundle can restore the draft offline');
  $('#hwMonitorAddresses').value='0x20';$('#hwMonitorInterval').value='1000';const count=device.sent.length;$('#hwMonitorToggle').click();await wait(()=>$('#hwMonitorRows').children.length>0);assert.equal(device.sent[count].command,1);assert.match($('#hwMonitorToggle').textContent,/停止/);
  $('#hwRegValue').value='71';await click('#hwWriteOne');assert.equal(device.maxActive,1);$('#hwMonitorToggle').click();const stopped=device.sent.length;await sleep(1100);assert.equal(device.sent.length,stopped);
  $('#hwMonitorExport').click();assert.match(blobs.at(-1).parts.join(''),/^time,address_hex,value_hex\r\n/);
  pass('register monitor only reads, serializes around a write and stops polling explicitly');
  const prior=device.sent.length;$('#hwMonitorAddresses').value='0x20,0x20';$('#hwMonitorToggle').click();await sleep(20);assert.equal(device.sent.length,prior);assert.match($('#toast').textContent,/重复/);
  pass('invalid monitor lists produce no hardware traffic');
  assert.deepEqual(x.errors,[]);
 }finally{x.close();}
 x=await make();try{
  const {$,device,wait}=x;$('#hwMonitorAddresses').value='20';device.hook=r=>r.command===1&&r.address===32?{nack:true}:{};$('#hwMonitorToggle').click();await wait(()=>/读回失败/.test($('#hwMonitorInfo').textContent));assert.equal($('#hwRestoreLast').disabled,true);const stop=device.sent.length;await sleep(1100);assert.equal(device.sent.length,stop);assert.deepEqual(x.errors,[]);
  pass('monitor read failure invalidates freshness and stops automatic polling');
 }finally{x.close();}
 console.log(checks+' release UI checks passed; synthetic DOM and protocol fixture, no hardware I/O');
})().catch(e=>{console.error(e);process.exitCode=1;});
