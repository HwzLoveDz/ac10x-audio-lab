/* Real fast-check properties. Synthetic DOM only: never a hardware/audio test.
 * Primary docs: https://fast-check.dev/docs/core-blocks/
 * Replay: node qa/verify-properties.cjs --only NAME --seed N --path PATH
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const fc=require('fast-check'),{JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'AC10x-Audio-Lab.html'),'utf8');
const bundleSHA256=crypto.createHash('sha256').update(html).digest('hex');
const args=process.argv.slice(2),arg=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const tick=()=>new Promise(resolve=>setImmediate(resolve)),copy=value=>JSON.parse(JSON.stringify(value));
const agcText='AGC\nTargetLevel = -14, NoiseThreshold = -70, MaxGain = 20\nAGCTime(ms)\nDecayTime = 999, AttackTime = 999\nDecayTimeReg = 5F, AttackTimeReg = 1F, SignalDebounceTimeReg = 5, NoiseDebounceTimeReg = C';
function make({device=null}={}){
  const calls={nativeHid:0,usb:0,serial:0,media:0,audio:0,network:0},fakeCalls={pick:0},errors=[],downloads=[],trace=[];
  const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(html,{url:'http://127.0.0.1:0/property-fixture/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
    const denied=(key,name)=>{calls[key]++;throw Error('REAL I/O BLOCKED: '+name);};
    w.scrollTo=()=>{};w.URL.createObjectURL=blob=>{downloads.push(blob);return'blob:local-property-fixture';};w.URL.revokeObjectURL=()=>{};
    w.Blob=class{constructor(parts,options){this.parts=parts;this.type=options?.type;}};w.HTMLAnchorElement.prototype.click=function(){};
    Object.defineProperty(w.navigator,'hid',{value:{requestDevice:async()=>{if(!device)return denied('nativeHid','HID');fakeCalls.pick++;return[device];},getDevices:async()=>denied('nativeHid','HID enumeration'),addEventListener(){},removeEventListener(){}}});
    Object.defineProperty(w.navigator,'usb',{value:{requestDevice:async()=>denied('usb','USB'),getDevices:async()=>denied('usb','USB enumeration')}});
    Object.defineProperty(w.navigator,'serial',{value:{requestPort:async()=>denied('serial','serial'),getPorts:async()=>denied('serial','serial enumeration')}});
    Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>denied('media','microphone'),enumerateDevices:async()=>denied('media','media enumeration')}});
    for(const name of ['AudioContext','webkitAudioContext','OfflineAudioContext','webkitOfflineAudioContext','Audio'])w[name]=class{constructor(){denied('audio',name);}};
    w.HTMLMediaElement.prototype.play=function(){return Promise.reject((()=>{calls.audio++;return Error('REAL PLAYBACK BLOCKED');})());};
    w.fetch=async()=>denied('network','fetch');w.XMLHttpRequest=class{constructor(){denied('network','XHR');}};w.WebSocket=class{constructor(){denied('network','WebSocket');}};
  }});
  const w=dom.window,d=w.document,$=s=>d.querySelector(s),A=w.AudioLab;
  const event=(el,name)=>el.dispatchEvent(new w.Event(name,{bubbles:true}));
  const state=()=>({config:copy(A.getConfig()),reference:A.getReferenceMclk(),context:copy(A.getContext()),panelHidden:$('#settingsWindow').hidden,title:$('#inspectorTitle').textContent,bodyNode:d.body.dataset.selectedNode,profile:$('#hwProfile').value});
  function invariant(){assert.deepEqual(errors,[],'Uncaught page error');A.validateConfig(A.getConfig());A.validateConfig(A.getAuditionConfig());assert.equal($('#hwProfile').value,A.getConfig().profile,'Target selector and config profile disagree');assert.equal($('#hwMclk').value,String(A.getReferenceMclk()));assert.equal($('#legacyExportMclk').value,String(A.getReferenceMclk()));assert.equal($('#legacyExportMclk').readOnly,true);if(!$('#settingsWindow').hidden){const context=A.getContext();assert.equal(d.body.dataset.view,context.view,'Visible workspace and API context disagree');assert.equal(d.body.dataset.selectedNode,context.node,'Visible module and API context disagree');if(context.view==='dynamics')assert.ok(w.AudioI18n.sourceText($('#inspectorTitle')).startsWith(context.node.toUpperCase()),'Dynamics title and context disagree');}assert.ok(Object.values(calls).every(v=>v===0),'Real I/O attempted: '+JSON.stringify(calls));}
  function file(selector,name,text){const el=$(selector);Object.defineProperty(el,'files',{configurable:true,value:[{name,size:typeof text==='string'?text.length:512,text:typeof text==='function'?text:async()=>text}]});trace.push({action:'file',selector,name});event(el,'change');}
  function envelope(config=A.getConfig(),reference=A.getReferenceMclk()){return JSON.stringify({format:'AC10x-configuration',schemaVersion:1,config,referenceMclkHz:reference});}
  function edit(bind,value){const el=$('[data-bind="'+bind+'"]');assert.ok(el,'Missing input '+bind);el.focus();el.value=String(value);event(el,'input');el.blur();return el;}
  async function flush(){await tick();await tick();invariant();}
  async function wait(predicate,label='condition'){for(let i=0;i<300;i++){if(predicate())return;await tick();}throw Error('Fixture timeout: '+label+' / '+$('#hwStatus')?.textContent);}
  return{w,d,$,A,calls,fakeCalls,errors,downloads,trace,state,invariant,file,envelope,edit,event,flush,wait,close(){w.dispatchEvent(new w.Event('pagehide'));w.close();}};
}
function reportRunner(prefix){
  const output=path.resolve(arg('--output','C:/Users/Harvey/Desktop/Opensource Hardware/AC10x-Quality-Review-20261114'));
  const directory=path.join(output,prefix+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid);fs.mkdirSync(directory,{recursive:true});
  const summary={kind:prefix,library:'fast-check',libraryVersion:fc.__version,bundleSHA256,source:'synthetic DOM / fake HID; no real device or audio evidence',properties:[],startedAt:new Date().toISOString()},only=arg('--only',null);
  async function run(name,property,defaultRuns=32){if(only&&only!==name)return;const parameters={seed:Number(arg('--seed',20261114)),numRuns:Number(arg('--runs',defaultRuns)),verbose:2};const replay=arg('--path',null);if(replay!==null)parameters.path=replay;
    console.log('START '+prefix+' '+name+' / '+parameters.numRuns+' cases');const result=await fc.check(property,parameters);
    const item={name,passed:!result.failed,numRuns:result.numRuns,numShrinks:result.numShrinks,seed:result.seed,counterexamplePath:result.counterexamplePath||null,counterexample:result.failed?fc.stringify(result.counterexample):null,error:result.errorInstance?.stack||result.error||null,interrupted:result.interrupted,replay:result.failed?'node qa/verify-'+prefix+'.cjs --only '+name+' --seed '+result.seed+' --path '+result.counterexamplePath:null};
    summary.properties.push(item);fs.writeFileSync(path.join(directory,name+'.json'),JSON.stringify({...item,bundleSHA256,parameters},null,2));console.log((item.passed?'PASS ':'FAIL ')+name+' cases='+item.numRuns+' shrinks='+item.numShrinks+(item.passed?'':' seed='+item.seed+' path='+item.counterexamplePath));
  }
  function writeTrace(name,value){fs.writeFileSync(path.join(directory,name+'-trace.json'),JSON.stringify(value,null,2));}
  function finish(){summary.completedAt=new Date().toISOString();summary.passed=summary.properties.length>0&&summary.properties.every(x=>x.passed);fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({passed:summary.passed,properties:summary.properties.length,cases:summary.properties.reduce((n,x)=>n+x.numRuns,0),directory,bundleSHA256,realIO:'BLOCKED / NOT USED'}));if(!summary.passed)process.exitCode=1;return summary;}
  return{run,writeTrace,finish,directory};
}
async function withWorld(run,name,fn){const x=make();try{await x.flush();await fn(x);x.invariant();}catch(error){run.writeTrace(name,{trace:x.trace,state:x.state(),calls:x.calls,error:error.stack});throw error;}finally{x.close();}}
async function main(){
  const run=reportRunner('properties');
  const rawNumber=fc.oneof(fc.constantFrom('','0','-1','0.001','1.5','NaN','Infinity','1e309','50000001','1000000','50000000','8192','8192.1'),fc.integer({min:-2000000,max:52000000}).map(String),fc.double({min:-10000,max:10000,noNaN:true,noDefaultInfinity:true}).map(String));
  const numericField=fc.constantFrom('mclk','agc.attack','agc.release','agc.debounce','agc.noiseDebounce','hpf.freq','eq.bands.0.freq','eq.bands.1.gain','eq.bands.2.q');
  await run.run('number-commit-atomicity',fc.asyncProperty(numericField,rawNumber,async(field,raw)=>withWorld(run,'number-commit-atomicity',async x=>{
    x.A.navigate(field==='mclk'?'clock':field.startsWith('eq.')?'eq':'dynamics');const before=x.state(),el=field==='mclk'?x.$('#hwMclk'):x.$('input[type="number"][data-bind="'+field+'"]');assert.ok(el);
    el.focus();el.value=raw;const accepted=el.value!==''&&el.validity.valid,inputValue=Number(el.value);x.trace.push({field,raw,sanitized:el.value,accepted});x.event(el,'input');el.blur();await x.flush();
    const get=(c,p)=>p.split('.').reduce((o,k)=>o[k],c),after=x.state();assert.equal(field==='mclk'?after.reference:get(after.config,field),accepted?inputValue:field==='mclk'?before.reference:get(before.config,field),'An invalid input committed or a valid input was lost');assert.equal(Number(el.value),field==='mclk'?after.reference:get(after.config,field),'Committed field and displayed value disagree');
  })));
  const clockOperation=fc.oneof(...Object.entries({fs:[8000,11025,12000,16000,22050,24000,32000,44100,48000],bits:[16,20,24],slot:[16,24,32],slots:[1,2],format:['I2S','PCM','LJ','RJ'],role:['slave','master']}).map(([field,values])=>fc.record({field:fc.constant(field),value:fc.constantFrom(...values)})));
  await run.run('clock-sequences-remain-valid',fc.asyncProperty(fc.array(clockOperation,{minLength:1,maxLength:18}),async operations=>withWorld(run,'clock-sequences-remain-valid',async x=>{
    x.A.navigate('clock');const reference=x.A.getReferenceMclk();for(const op of operations){x.trace.push(op);const el=x.$('[data-bind="clock.'+op.field+'"]');el.value=String(op.value);x.event(el,'input');x.event(el,'change');await x.flush();const c=x.A.getConfig();assert.ok(c.clock.slot>=c.clock.bits);assert.ok(c.clock.format==='PCM'||c.clock.slots===2);assert.ok(c.eq.bands.every(b=>b.freq<c.clock.fs/2));for(const field of ['fs','bits','slot','slots','format','role'])assert.equal(x.$('[data-bind="clock.'+field+'"]').value,String(c.clock[field]));assert.equal(x.A.getReferenceMclk(),reference);}
  })),24);
  const goodDocument=fc.record({profile:fc.constantFrom('AC101S','AC102'),pga:fc.integer({min:0,max:31}),fs:fc.constantFrom(8000,16000,24000,44100,48000),bits:fc.constantFrom(16,20,24),slot:fc.constantFrom(16,24,32),preGain:fc.integer({min:-18,max:0}),mclk:fc.integer({min:1000000,max:50000000})});
  await run.run('configuration-roundtrip',fc.asyncProperty(goodDocument,async input=>withWorld(run,'configuration-roundtrip',async x=>{
    const c=x.A.getDefaultConfig();Object.assign(c,{profile:input.profile,pga:input.pga});Object.assign(c.clock,{fs:input.fs,bits:input.bits,slot:Math.max(input.bits===20?24:input.bits,input.slot)});c.eq.preGain=input.preGain;c.eq.bands.forEach(b=>b.freq=Math.min(b.freq,Math.floor(input.fs*.4)));x.trace.push(input);x.file('#configFile','valid.json',x.envelope(c,input.mclk));await x.flush();assert.deepEqual(copy(x.A.getConfig()),copy(c));assert.equal(x.A.getReferenceMclk(),input.mclk);x.$('#exportConfig').click();const exported=JSON.parse(x.downloads.at(-1).parts.join(''));assert.equal(exported.format,'AC10x-configuration');assert.equal(exported.schemaVersion,1);assert.deepEqual(exported.config,copy(c));assert.equal(exported.referenceMclkHz,input.mclk);x.file('#configFile','roundtrip.json',JSON.stringify(exported));await x.flush();assert.deepEqual(copy(x.A.getConfig()),copy(c));
  })),24);
  await run.run('rejected-import-is-atomic',fc.asyncProperty(fc.constantFrom('malformed','schema','pga-fraction','clock-width','clock-slots','eq-nyquist','reference','raw'),async fault=>withWorld(run,'rejected-import-is-atomic',async x=>{
    x.A.setReferenceMclk(24576000);const before=x.state(),c=copy(before.config),doc={format:'AC10x-configuration',schemaVersion:1,config:c,referenceMclkHz:8000000};if(fault==='schema')doc.schemaVersion=99;if(fault==='pga-fraction')c.pga=1.5;if(fault==='clock-width'){c.clock.bits=24;c.clock.slot=16;}if(fault==='clock-slots'){c.clock.format='I2S';c.clock.slots=1;}if(fault==='eq-nyquist')c.eq.bands[0].freq=c.clock.fs/2;if(fault==='reference')doc.referenceMclkHz=1.5;if(fault==='raw')c.raw={'127':256};x.trace.push({fault});x.file('#configFile','invalid.json',fault==='malformed'?'{':JSON.stringify(doc));await x.flush();assert.deepEqual(copy(x.A.getConfig()),before.config);assert.equal(x.A.getReferenceMclk(),before.reference);
  })),24);
  run.finish();
}
module.exports={fc,make,tick,copy,agcText,bundleSHA256,reportRunner};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
