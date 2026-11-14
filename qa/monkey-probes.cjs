/* Monkey findings converted to regressions. Synthetic DOM only; all native/network I/O blocked. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const calls={hid:0,audio:0,media:0,network:0,download:0},errors=[];
const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../AC10x-Audio-Lab.html'),'utf8'),{
  url:'https://monkey-probe.invalid/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
  beforeParse(w){
    w.scrollTo=()=>{};w.URL.createObjectURL=()=>{calls.download++;throw Error('Download blocked');};w.URL.revokeObjectURL=()=>{};
    w.HTMLAnchorElement.prototype.click=function(){calls.download++;throw Error('Download blocked');};
    w.fetch=async()=>{calls.network++;throw Error('Network blocked');};
    w.XMLHttpRequest=class{constructor(){calls.network++;throw Error('XHR blocked');}};
    w.WebSocket=class{constructor(){calls.network++;throw Error('WebSocket blocked');}};
    w.AudioContext=class{constructor(){calls.audio++;throw Error('Audio blocked');}};
    Object.defineProperty(w.navigator,'hid',{value:{requestDevice:async()=>{calls.hid++;throw Error('HID blocked');},addEventListener(){},removeEventListener(){}}});
    Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>{calls.media++;throw Error('Media blocked');},enumerateDevices:async()=>{calls.media++;throw Error('Enumeration blocked');}}});
  }
});
const w=dom.window,d=w.document,$=s=>d.querySelector(s),tick=()=>new Promise(r=>setTimeout(r,15));
const event=(el,name)=>el.dispatchEvent(new w.Event(name,{bubbles:true}));
let count=0;const pass=name=>{count++;console.log('PASS '+name);};
const agc='AGC\nTargetLevel = -14, NoiseThreshold = -70, MaxGain = 20\nAGCTime(ms)\nDecayTime = 999, AttackTime = 999\nDecayTimeReg = 5F, AttackTimeReg = 1F, SignalDebounceTimeReg = 5, NoiseDebounceTimeReg = C';
function file(selector,name,text){const value={name,size:typeof text==='string'?text.length:256,text:typeof text==='string'?async()=>text:text};Object.defineProperty($(selector),'files',{configurable:true,value:[value]});event($(selector),'change');}
function delayed(selector,name){let release;file(selector,name,()=>new Promise(r=>release=r));return text=>release(text);}
function envelope({profile='AC102',pga=20,mclk=24576000}={}){const config=w.AudioLab.getConfig();config.profile=profile;config.pga=pga;return JSON.stringify({format:'AC10x-configuration',schemaVersion:1,config,referenceMclkHz:mclk});}
function draft(){const c=w.AudioLab.getConfig();return{profile:c.profile,pga:c.pga,agcRelease:c.agc.release,mclk:w.AudioLab.getReferenceMclk(),profileSelector:$('#hwProfile').value};}
function reset(){if(!$('#featureFinder').hidden)$('#closeFeatureFinder').click();$('#resetConfig').click();w.AudioLab.setReferenceMclk(12288000);}
function editPga(value){w.AudioLab.openNode('pga');const el=$('[data-bind="pga"]');assert.ok(el);el.value=String(value);event(el,'input');assert.equal(w.AudioLab.getConfig().pga,value);}
(async()=>{try{
  reset();w.AudioLab.openNode('hpf');$('#openFeatureFinder').click();$('#featureQuery').focus();
  for(const extra of [{isComposing:true},{keyCode:229}]){
    $('#featureQuery').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true,...extra}));
    assert.equal($('#featureFinder').hidden,false);assert.equal($('#settingsWindow').hidden,false);
    assert.deepEqual({...w.AudioLab.getContext()},{view:'dynamics',node:'hpf'});assert.equal(d.activeElement,$('#featureQuery'));
  }
  pass('IME Escape does not close the underlying HPF workspace through feature search');

  reset();file('#legacyPresetFile','first.AC102',agc);await tick();
  assert.equal(w.AudioLab.getConfig().agc.release,2);assert.equal($('#importMessage').hidden,false);
  editPga(15);assert.equal($('#importMessage').hidden,true,'A later edit supersedes legacy-import notice');
  file('#legacyPresetFile','second.AC102',agc);await tick();assert.equal($('#importMessage').hidden,false);
  $('#resetConfig').click();assert.equal(w.AudioLab.getConfig().agc.release,120);assert.equal($('#importMessage').hidden,true);
  pass('legacy-import notice clears when later edits or example reset replace its active-draft context');

  reset();const pendingReset=envelope(),releaseReset=delayed('#configFile','slow-reset.json');
  $('#resetConfig').click();const resetState=draft();releaseReset(pendingReset);await tick();
  assert.deepEqual(draft(),resetState,'Pending config import overwrote a newer example reset');
  pass('a later example reset wins over an older slow JSON import including profile and MCLK');

  reset();const pendingEdit=envelope(),releaseEdit=delayed('#configFile','slow-edit.json');
  editPga(15);const editState=draft();releaseEdit(pendingEdit);await tick();
  assert.deepEqual(draft(),editState,'Pending config import overwrote a newer parameter edit');
  pass('a later parameter edit wins over an older slow JSON import');

  reset();const pendingJson=envelope(),releaseJson=delayed('#configFile','older-json.json');
  file('#legacyPresetFile','newer-legacy.AC102',agc);await tick();const legacyState=draft();
  assert.equal(legacyState.agcRelease,2);releaseJson(pendingJson);await tick();assert.deepEqual(draft(),legacyState);
  pass('a newer legacy import supersedes an older JSON file read across import controls');

  reset();const releaseLegacy=delayed('#legacyPresetFile','older-legacy.AC102');
  file('#configFile','newer-json.json',envelope({profile:'AC102',pga:18,mclk:24576000}));await tick();const jsonState=draft();
  assert.equal(jsonState.pga,18);assert.equal(jsonState.mclk,24576000);assert.equal(jsonState.agcRelease,120);
  releaseLegacy(agc);await tick();assert.deepEqual(draft(),jsonState);assert.equal($('#importMessage').hidden,true);
  pass('a newer JSON import supersedes an older legacy file read without stale notice or AGC changes');

  // JSDOM file injection does not populate native input.value. Model only its selected-name
  // lifecycle here: selections set a fakepath, and application cleanup assigns an empty string.
  function selectedName(selector){let value='';const el=$(selector);Object.defineProperty(el,'value',{configurable:true,get:()=>value,set:next=>{value=String(next);}});return next=>{value=next;};}
  const selectJson=selectedName('#configFile'),selectLegacy=selectedName('#legacyPresetFile');
  reset();const crossPayload=envelope();selectJson('C:\\fakepath\\older-json.json');const finishCross=delayed('#configFile','older-json.json');
  selectLegacy('C:\\fakepath\\newer-legacy.AC102');file('#legacyPresetFile','newer-legacy.AC102',agc);await tick();
  assert.equal($('#legacyPresetFile').value,'');assert.notEqual($('#configFile').value,'');
  finishCross(crossPayload);await tick();assert.equal($('#configFile').value,'','Superseded cross-control file must clear for reselecting the same file');
  reset();const olderPayload=envelope({pga:18}),newerPayload=envelope({pga:21});
  selectJson('C:\\fakepath\\older.json');const finishOlder=delayed('#configFile','older.json');
  selectJson('C:\\fakepath\\newer.json');const finishNewer=delayed('#configFile','newer.json');
  finishOlder(olderPayload);await tick();assert.equal($('#configFile').value,'C:\\fakepath\\newer.json','Old request must not clear a newer selection on the same control');
  finishNewer(newerPayload);await tick();assert.equal($('#configFile').value,'');assert.equal(w.AudioLab.getConfig().pga,21);
  pass('file cleanup clears stale cross-control selections while preserving a newer same-control selection');

  assert.deepEqual(calls,{hid:0,audio:0,media:0,network:0,download:0});assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:count,calls,jsdomErrors:errors}));
}finally{w.dispatchEvent(new w.Event('pagehide'));w.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
