/* Actual fast-check Scheduler controls file completions and fake HID replies.
 * https://fast-check.dev/docs/advanced/race-conditions/
 * https://fast-check.dev/docs/api/interfaces/Scheduler/
 * No browser/native device or audio APIs are used. Replay seed AND path.
 */
'use strict';
const assert=require('node:assert/strict');
const {fc,make,tick,copy,agcText,reportRunner}=require('./verify-properties.cjs');
const {FakeHID,config}=require('./fake-hid.cjs'),T=require('../transport.js'),C=require('../codec.js'),S=require('../session.js');
const schedulerArbitrary=fc.scheduler({act:async run=>{await run();await tick();}});
function scheduledFile(x,s,kind,label,{pga=20,mclk=24576000}={}){
  const c=x.A.getConfig();c.pga=pga;c.profile='AC102';
  const legacy=kind==='agc'||kind==='invalid-agc',text=kind==='agc'?agcText:kind==='invalid-agc'?agcText.replace('NoiseThreshold = -70','NoiseThreshold = -71'):kind==='invalid'?'{':x.envelope(c,mclk);
  x.file(legacy?'#legacyPresetFile':'#configFile',label+(legacy?'.AC102':'.json'),()=>s.schedule(Promise.resolve(text),label,{kind,pga,mclk}));
  return{kind,text,config:copy(c),reference:mclk};
}
async function until(predicate,label){for(let i=0;i<500;i++){if(predicate())return;await tick();}throw Error('Timed out waiting for controlled '+label);}
function gateOneReply(device,s,filter,label){const original=device.emit.bind(device);let armed=true,held=null;
  device.emit=(bytes,id)=>{if(armed&&filter(bytes)){armed=false;held=s.schedule(Promise.resolve(Array.from(bytes)),label,{command:bytes[0],address:(bytes[4]<<8)|bytes[5]}).then(value=>original(value,id));held.catch(()=>{});}else original(bytes,id);};
  return{get held(){return held;},restore(){device.emit=original;}};
}
async function main(){
  const run=reportRunner('scheduler'),cases=new Map();
  async function world(name,s,input,fn,{device=null}={}){const x=make({device});let error=null;try{await x.flush();await fn(x);x.invariant();}catch(e){error=e;throw e;}finally{const record={input,trace:x.trace,schedule:s.report(),state:x.state(),calls:x.calls,fakeCalls:x.fakeCalls,device:device?{sent:device.sent,memory:device.mem,writes:device.writes,maxActive:device.maxActive}:null,error:error?.stack||null};const list=cases.get(name)||[];list.push(record);cases.set(name,list);run.writeTrace(name,list);x.close();}}
  await run.run('pending-import-versus-new-draft-intent',fc.asyncProperty(schedulerArbitrary,fc.constantFrom('json','agc'),fc.constantFrom('edit','reference','reset'),async(s,kind,intervention)=>world('pending-import-versus-new-draft-intent',s,{kind,intervention},async x=>{
    x.A.openNode('hpf');scheduledFile(x,s,kind,'older-file');
    if(intervention==='edit'){x.A.openNode('pga');x.edit('pga',15);}if(intervention==='reference')x.A.setReferenceMclk(8000000);if(intervention==='reset')x.$('#resetConfig').click();
    const wanted=x.state();await s.waitIdle();await x.flush();assert.deepEqual(copy(x.A.getConfig()),wanted.config,'Older file completion overwrote a later draft operation');assert.equal(x.A.getReferenceMclk(),wanted.reference,'Older file restored a superseded MCLK');
  })),20);
  await run.run('last-selected-import-wins-any-resolution-order',fc.asyncProperty(schedulerArbitrary,fc.array(fc.constantFrom('json','agc','invalid','invalid-agc'),{minLength:2,maxLength:5}),async(s,kinds)=>world('last-selected-import-wins-any-resolution-order',s,{kinds},async x=>{
    const initial=x.state();let last;for(let i=0;i<kinds.length;i++)last=scheduledFile(x,s,kinds[i],'selection-'+i,{pga:17+i,mclk:8000000+i*1000000});
    let wanted=initial.config,reference=initial.reference;if(last.kind==='json'){wanted=last.config;reference=last.reference;}else if(last.kind==='agc')wanted=copy(x.A.validateConfig(x.w.AudioLegacy.parsePreset(agcText,initial.config).config));
    await s.waitIdle();await x.flush();assert.deepEqual(copy(x.A.getConfig()),wanted,'Resolution order defeated most recent file selection');assert.equal(x.A.getReferenceMclk(),reference);
  })),24);
  await run.run('slow-legacy-import-preserves-later-workspace',fc.asyncProperty(schedulerArbitrary,fc.constantFrom('clock','eq','close','roundtrip-hpf'),async(s,destination)=>world('slow-legacy-import-preserves-later-workspace',s,{destination},async x=>{
    x.A.openNode('hpf');scheduledFile(x,s,'agc','slow-legacy');if(destination==='close')x.$('#closeSettings').click();else if(destination==='roundtrip-hpf'){x.A.navigate('clock');x.A.openNode('hpf');}else x.A.navigate(destination);const wanted=x.state();
    await s.waitIdle();await x.flush();assert.equal(x.A.getConfig().agc.release,2,'Valid import did not update its draft');assert.equal(x.$('#settingsWindow').hidden,wanted.panelHidden,'Late import reopened a user-closed panel');assert.deepEqual(copy(x.A.getContext()),wanted.context,'Late import took over a later workspace');
  })),12);
  await run.run('write-click-freezes-config-and-scope',fc.asyncProperty(schedulerArbitrary,fc.boolean(),fc.constantFrom('eq','clock','hardware'),async(s,monitorInFlight,destination)=>{
    const device=new FakeHID();await world('write-click-freezes-config-and-scope',s,{monitorInFlight,destination},async x=>{
      x.$('#usbConnect').click();await x.wait(()=>x.d.body.dataset.hardware==='ready','fake connect');assert.equal(device.writes,0);x.A.openNode('pga');x.edit('pga',20);const frozen=x.A.getConfig(),before={...device.mem},plan=C.makePlan(frozen,before,{groups:['routing'],scope:'pga',mclkHz:x.A.getReferenceMclk(),profile:frozen.profile}),expected={...before};for(const p of plan.steps)expected[p.address]=p.after;assert.ok(plan.steps.length,'Fixture needs a changed PGA');
      const gate=gateOneReply(device,s,b=>b[0]===1,'held-read-before-apply');
      if(monitorInFlight){x.$('#hwMonitorAddresses').value='0x20';x.$('#hwMonitorToggle').click();await x.wait(()=>gate.held!==null,'monitor response held');}
      assert.equal(x.$('#hwApply').disabled,false);x.$('#hwApply').click();if(!monitorInFlight)await x.wait(()=>gate.held!==null,'apply response held');
      x.A.openNode('pga');x.edit('pga',3);x.A.navigate(destination);const newerDraft=x.state();await s.waitIdle();await x.wait(()=>!x.$('#hwRead').disabled,'write settles');await x.flush();
      assert.deepEqual(device.mem,expected,'The transaction committed a later draft or workspace rather than its click-time scope');assert.deepEqual(copy(x.A.getConfig()),newerDraft.config,'Write completion overwrote newer draft edits');assert.equal(device.maxActive,1);assert.match(x.$('#hwStatus').textContent,/核验|待写入|一致/);gate.restore();
    },{device});
  }),12);
  await run.run('cancel-write-queued-behind-monitor',fc.asyncProperty(schedulerArbitrary,fc.constantFrom('0x20','0x1c','0x31'),async(s,address)=>{
    const device=new FakeHID();await world('cancel-write-queued-behind-monitor',s,{address},async x=>{
      x.$('#usbConnect').click();await x.wait(()=>x.d.body.dataset.hardware==='ready','fake connect');x.A.openNode('pga');x.edit('pga',20);const before={...device.mem},gate=gateOneReply(device,s,b=>b[0]===1,'held-monitor-for-cancel');x.$('#hwMonitorAddresses').value=address;x.$('#hwMonitorToggle').click();await x.wait(()=>gate.held!==null,'monitor response held');
      x.$('#hwApply').click();assert.equal(x.$('#hwCancel').disabled,false);x.$('#hwCancel').click();await s.waitIdle();await x.wait(()=>!x.$('#hwRead').disabled,'cancel settles');await x.flush();assert.equal(device.writes,0,'Cancel during a monitor wait still started the queued write');assert.deepEqual(device.mem,before);gate.restore();
      x.$('#hwApply').click();await x.wait(()=>!x.$('#hwRead').disabled,'explicit later apply');assert.ok(device.writes>0,'Cancelled queue prevented a later explicit write');assert.equal(device.maxActive,1);
    },{device});
  }),6);
  await run.run('clear-reference-supersedes-pending-file',fc.asyncProperty(schedulerArbitrary,fc.integer({min:0,max:255}),async(s,value)=>world('clear-reference-supersedes-pending-file',s,{value},async x=>{
    x.A.navigate('registers');x.$('#legacyTools').open=true;const text='0x20,0x'+value.toString(16).padStart(2,'0');x.file('#legacyRegisterFile','older-reference.csv',()=>s.schedule(Promise.resolve(text),'older-reference-file',{value}));assert.equal(x.$('#legacyClearRegisters').disabled,false);x.$('#legacyClearRegisters').click();const wanted={rows:x.$('#legacyRegisterRows').textContent,info:x.$('#legacyRegisterInfo').textContent};
    await s.waitIdle();await x.flush();assert.equal(x.$('#legacyRegisterRows').textContent,wanted.rows,'A cleared reference table was resurrected by an older file read');assert.equal(x.$('#legacyRegisterInfo').textContent,wanted.info);assert.equal(x.fakeCalls.pick,0);
  })),6);
  await run.run('current-baseline-supersedes-pending-file',fc.asyncProperty(schedulerArbitrary,fc.integer({min:0,max:255}),async(s,value)=>{
    const device=new FakeHID();await world('current-baseline-supersedes-pending-file',s,{value},async x=>{
      x.$('#usbConnect').click();await x.wait(()=>x.d.body.dataset.hardware==='ready','fake connect');const text=JSON.stringify({registers:{0:0x12,32:value}});x.file('#hwBaselineFile','older-baseline.json',()=>s.schedule(Promise.resolve(text),'older-baseline-file',{value}));assert.equal(x.$('#hwSaveBaseline').disabled,false,'Current readback baseline must be a reachable later action');x.$('#hwSaveBaseline').click();x.$('#hwExportDebug').click();const wanted=JSON.parse(x.downloads.at(-1).parts.join('')).baseline;assert.ok(wanted.readAt);assert.deepEqual(wanted.snapshot,device.mem);
      await s.waitIdle();await x.flush();x.$('#hwExportDebug').click();const actual=JSON.parse(x.downloads.at(-1).parts.join('')).baseline;assert.deepEqual(actual,wanted,'An older imported file replaced the later current-readback baseline');assert.equal(device.writes,0,'Baseline comparison unexpectedly wrote hardware');
    },{device});
  }),6);
  for(const interruption of ['cancel','disconnect'])await run.run('transaction-'+interruption+'-and-recovery',fc.asyncProperty(schedulerArbitrary,fc.integer({min:-18,max:-1}),async(s,preGain)=>{
    const name='transaction-'+interruption+'-and-recovery',device=new FakeHID(),bridge=new T.HidBridge(device,{timeoutMs:5000}),session=new S.RegisterSession(bridge),before={...device.mem},trace=[];let error=null;
    try{
      await bridge.open();await session.readAll();const c=config();c.eq.preGain=preGain;const gate=gateOneReply(device,s,b=>b[0]===0,'first-write-ack');
      const pending=session.apply(c,{groups:['eq'],mclkHz:12288000}).then(value=>({value}),failure=>({failure}));await until(()=>gate.held!==null,'first write acknowledgement');trace.push({event:'interrupt',interruption,sent:device.sent.length,writes:device.writes});
      if(interruption==='cancel')session.cancel();else bridge.disconnected();await s.waitIdle();const result=await pending;assert.ok(result.failure,'Interrupted transaction falsely succeeded');assert.equal(result.failure.code,interruption==='cancel'?'CANCELLED':'DISCONNECTED');assert.equal(session.busy,false);assert.equal(session.stale,true);assert.equal(device.maxActive,1);const writesAfterFailure=device.writes;
      if(interruption==='cancel'){assert.deepEqual(device.mem,before,'Cancellation failed to restore touched state');assert.ok(result.failure.details.restored.length>0);assert.equal(result.failure.details.restoreFailed.length,0);await session.readAll();assert.equal(session.stale,false);}else{assert.equal(device.writes,1,'Disconnect unexpectedly replayed recovery writes');assert.equal(result.failure.details.restored.length,0);await bridge.close();await bridge.open();await session.readAll();assert.equal(device.writes,writesAfterFailure,'Reconnection replayed an old transaction');}
      gate.restore();const again=await session.apply(c,{groups:['eq'],mclkHz:12288000});assert.equal(again.verified,true,'Explicit new transaction could not recover');assert.equal(session.busy,false);assert.equal(session.stale,false);assert.equal(device.maxActive,1);
    }catch(e){error=e;throw e;}finally{const record={input:{interruption,preGain},trace,schedule:s.report(),sent:device.sent,history:session.history,state:{busy:session.busy,stale:session.stale,writes:device.writes,maxActive:device.maxActive},realIO:'NOT USED; FakeHID only',error:error?.stack||null};const list=cases.get(name)||[];list.push(record);cases.set(name,list);run.writeTrace(name,list);await bridge.close();}
  }),12);
  run.finish();
}
main().catch(error=>{console.error(error);process.exitCode=1;});
