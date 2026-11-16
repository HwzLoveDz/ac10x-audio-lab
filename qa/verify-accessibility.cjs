/* Semantic and keyboard regression checks. Synthetic DOM + protocol fixture only.
 * Native browser focus order, rendered contrast and assistive technology behavior
 * are deliberately left to the separate HTTP browser/axe review. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom'),{FakeHID}=require('./fake-hid.cjs');
let checks=0;const failures=[],pass=name=>{checks++;console.log('PASS '+name);};
const tick=()=>new Promise(resolve=>setTimeout(resolve,12));
const device=new FakeHID(),errors=[],calls={fixtureChooser:0,nativeAudio:0,media:0,network:0};
const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../AC10x-Audio-Lab.html'),'utf8'),{
 url:'http://127.0.0.1/accessibility-fixture/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
 beforeParse(w){
  w.scrollTo=()=>{};w.URL.createObjectURL=()=> 'blob:synthetic-only';w.URL.revokeObjectURL=()=>{};
  w.HTMLAnchorElement.prototype.click=function(){};
  w.AudioContext=class{constructor(){calls.nativeAudio++;throw Error('Native audio forbidden');}};
  w.fetch=async()=>{calls.network++;throw Error('Network forbidden in semantic test');};
  Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>{calls.media++;throw Error('Native capture forbidden');},enumerateDevices:async()=>{calls.media++;throw Error('Native enumeration forbidden');}}});
  Object.defineProperty(w.navigator,'hid',{value:{requestDevice:async()=>{calls.fixtureChooser++;return[device];},addEventListener(){},removeEventListener(){}}});
 }
});
const w=dom.window,d=w.document,$=selector=>d.querySelector(selector),all=selector=>[...d.querySelectorAll(selector)];
const text=el=>(el?.textContent||'').replace(/\s+/g,' ').trim();
let styleCache=new WeakMap();
function name(el){
 if(el.hasAttribute('aria-labelledby'))return el.getAttribute('aria-labelledby').split(/\s+/).map(id=>text(d.getElementById(id))).join(' ').trim();
 if(el.hasAttribute('aria-label'))return el.getAttribute('aria-label').trim();
 if(el.labels?.length)return [...el.labels].map(text).join(' ');
 return text(el)||el.getAttribute('title')||'';
}
function shown(el){
 if(!el?.isConnected)return false;
 if(el.closest('[hidden],.view:not(.active)'))return false;
 for(let node=el;node&&node.nodeType===1;node=node.parentElement)if(node.tagName==='DETAILS'&&!node.open&&!node.querySelector(':scope > summary')?.contains(el))return false;
 for(let node=el;node&&node.nodeType===1;node=node.parentElement){
  if(node.hidden)return false;
  let s=styleCache.get(node);if(!s){s=w.getComputedStyle(node);styleCache.set(node,s);}if(s.display==='none'||s.visibility==='hidden')return false;
 }
 return true;
}
function key(el,key,extra={}){const event=new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra});el.dispatchEvent(event);return event;}
async function wait(condition){const deadline=Date.now()+5000;while(!condition()){if(Date.now()>deadline)throw Error('Timed out: '+text($('#hwStatus')));await tick();}}
async function check(label,run){try{await run();pass(label);}catch(e){failures.push({label,message:e.message});console.error('FAIL '+label+' — '+e.message);}}
async function search(query){if($('#featureFinder').hidden)$('#openFeatureFinder').click();$('#featureQuery').value=query;$('#featureQuery').dispatchEvent(new w.Event('input',{bubbles:true}));await tick();}
function semanticInventory(){
 styleCache=new WeakMap();
 const ids=all('[id]').map(e=>e.id);assert.equal(new Set(ids).size,ids.length,'Duplicate DOM ids break label references');
 for(const el of all('[aria-labelledby],[aria-describedby]'))for(const attribute of ['aria-labelledby','aria-describedby'])for(const id of (el.getAttribute(attribute)||'').split(/\s+/).filter(Boolean))assert.ok(d.getElementById(id),'Dangling '+attribute+' '+id);
 for(const label of all('label[for]'))assert.ok(d.getElementById(label.htmlFor),'Dangling label '+label.htmlFor);
 for(const label of all('label'))assert.ok(label.querySelectorAll('input,select,textarea').length<=1,'One label must not wrap multiple independent controls');
 for(const el of all('button,input:not([type=file]),select,textarea,[role=button],[role=slider],progress').filter(shown)){
  assert.ok(name(el),'Unnamed visible control '+el.outerHTML.slice(0,160));
  assert.ok(!/^[-+×↻▶]$/.test(name(el)),'Icon-only name is not descriptive: '+el.outerHTML.slice(0,160));
 }
}
(async()=>{try{
 await check('initial offline view has unique labels, discoverable graph shortcuts and no unlabeled visible controls',()=>{semanticInventory();assert.equal($('#settingsWindow').hidden,true);assert.equal(calls.fixtureChooser,0);assert.ok($('#canvasScroll').getAttribute('aria-describedby').split(/\s+/).includes('canvasKeyboardHelp'));assert.match($('#canvasScroll').getAttribute('aria-keyshortcuts'),/ArrowLeft.*0/);assert.match(text($('#canvasKeyboardHelp')),/Tab.*Enter/);});
 await check('seven workspaces expose one current page and the compatible route action opens a separately named guide',async()=>{
  assert.deepEqual(all('[data-workspace]').map(el=>el.dataset.workspace),['overview','eq','dynamics','clock','hardware','registers','audio']);assert.equal($('[data-workspace=route]'),null);
  for(const language of ['zh-CN','en']){w.AudioI18n.setLanguage(language);await tick();assert.equal(d.documentElement.lang,language);
   for(const button of all('[data-workspace]')){button.click();await tick();assert.equal(all('[data-workspace][aria-current=page]').length,1);assert.equal(button.getAttribute('aria-current'),'page');semanticInventory();}
   w.AudioLab.openNode('pga');assert.equal(all('[data-workspace][aria-current=page]').length,1);assert.equal($('[data-workspace=overview]').getAttribute('aria-current'),'page');semanticInventory();
   w.AudioLab.navigate('route');assert.equal($('#guideWorkspace'),null);assert.ok($('#quickStart'));semanticInventory();assert.equal(all('[data-workspace][aria-current=page]').length,1);
  }
 });
 await check('three EQ band enable switches have distinct names; numeric/range labels target one control each',()=>{
  w.AudioLab.navigate('eq');for(const detail of all('.band-card'))detail.open=true;semanticInventory();
  const switches=all('.eq-band>.band-enable input[type=checkbox]'),names=switches.map(name);assert.equal(names.length,3);assert.equal(new Set(names).size,3,'Band enable switches need band-specific names: '+names.join(' / '));for(const el of switches)assert.ok(name(el).toLowerCase().includes(text(el.closest('label')).toLowerCase()),'Accessible band name must retain its visible enable label');
 });
 await check('EQ disclosure summaries contain no nested interactive controls and closed bands remain independently switchable',()=>{
  w.AudioLab.navigate('eq');
  for(const band of all('.eq-band')){const detail=band.querySelector('details[data-band-index]'),summary=detail.querySelector('summary'),toggle=band.querySelector(':scope > .band-enable input');
   assert.ok(toggle);assert.equal(toggle.closest('details'),null);assert.equal(summary.querySelectorAll('button,input,select,textarea,a[href],[tabindex]').length,0,'Disclosure summaries must contain no independently focusable controls');
   for(const open of [false,true]){detail.open=open;styleCache=new WeakMap();assert.ok(shown(toggle),'The enable switch must remain visible while the band is closed');toggle.focus();assert.equal(d.activeElement,toggle);const before=w.AudioLab.getConfig().eq.bands[Number(detail.dataset.bandIndex)].enabled;toggle.click();assert.equal(w.AudioLab.getConfig().eq.bands[Number(detail.dataset.bandIndex)].enabled,!before);assert.equal(detail.open,open,'Enabling a band must not toggle its disclosure');key(toggle,' ');assert.equal(detail.open,open,'A switch keyboard event must not propagate into disclosure activation');toggle.click();assert.equal(w.AudioLab.getConfig().eq.bands[Number(detail.dataset.bandIndex)].enabled,before);}
  }
 });
 await check('each mixer attenuation switch identifies the input it modifies',()=>{
  for(const id of ['rxmix','dacmix','txl','txr']){w.AudioLab.openNode(id);const names=all('#nodeInspector .mix-input input[type=checkbox]').map(name);assert.equal(names.length,4,id+' needs both independent inputs and attenuation controls');assert.equal(new Set(names).size,4,id+' exposes ambiguous input switches: '+names.join(' / '));}
 });
 await check('all generated signal-graph controls have explicit roles, names and keyboard activation',async()=>{
  for(const mode of ['full']){
   for(const graph of all('#routingSVG')){await tick();const controls=all('#routingSVG [data-node]');assert.ok(controls.length>0);
    for(const control of controls){assert.equal(control.getAttribute('role'),'button');assert.equal(control.getAttribute('tabindex'),'0');assert.ok(name(control));}
    const control=controls[0],id=control.dataset.node;key(control,'Enter');assert.equal(w.AudioLab.getContext().node,id);assert.equal($('#settingsWindow').hidden,false);
   }
  }
 });
 await check('EQ slider arrows update both draft values and their announced values',()=>{
  w.AudioLab.navigate('eq');let point=$('#eqChart [data-point="0"]');point.focus();const before=w.AudioLab.getConfig().eq.bands[0];
  key(point,'ArrowRight');point=$('#eqChart [data-point="0"]');const after=w.AudioLab.getConfig().eq.bands[0];assert.ok(after.freq>before.freq);assert.equal(Number(point.getAttribute('aria-valuenow')),after.freq);assert.ok(point.getAttribute('aria-valuetext').includes(String(after.freq)));assert.equal(d.activeElement,point);
  key(point,'ArrowUp');assert.equal(w.AudioLab.getConfig().eq.bands[0].gain,Math.min(15,after.gain+.5));
 });
 await check('modal search traps both Tab boundaries for normal and empty results and Escape returns focus',async()=>{
  for(const query of ['','zzzz-no-matching-feature']){ $('#openFeatureFinder').focus();await search(query);assert.equal(d.activeElement,$('#featureQuery'));
   const dialog=$('#featureFinder [role=dialog]');assert.equal(dialog.getAttribute('aria-modal'),'true');assert.ok(name(dialog));assert.equal(dialog.querySelector('header').getAttribute('role'),'none','Modal title header must not create a second page banner');
   const buttons=all('#featureResults button'),last=buttons.at(-1)||$('#featureQuery');assert.equal($('#featureQuery').getAttribute('aria-controls'),'featureResults');assert.equal($('#featureResultCount').getAttribute('role'),'status');assert.equal(parseInt(text($('#featureResultCount')),10),buttons.length);last.focus();const forward=key(last,'Tab');assert.equal(forward.defaultPrevented,true);assert.equal(d.activeElement,$('#closeFeatureFinder'));
   const backward=key($('#closeFeatureFinder'),'Tab',{shiftKey:true});assert.equal(backward.defaultPrevented,true);assert.equal(d.activeElement,last);
   key(last,'Escape');assert.equal($('#featureFinder').hidden,true);assert.equal(d.activeElement,$('#openFeatureFinder'));
  }
 });
 await check('search Arrow keys, IME and Enter stay within the intended modal flow',async()=>{
  await search('HPF');const result=$('#featureResults button');key($('#featureQuery'),'ArrowDown');assert.equal(d.activeElement,result);
  key(result,'Escape',{isComposing:true,keyCode:229});assert.equal($('#featureFinder').hidden,false);
  $('#featureQuery').focus();key($('#featureQuery'),'Enter');assert.equal($('#featureFinder').hidden,true);assert.equal(w.AudioLab.getContext().node,'hpf');assert.ok(shown(d.activeElement));
 });
 await check('search opens closed nested tools and transfers focus to the actual named field',async()=>{
  w.AudioLab.navigate('hardware');$('#hwMonitorAddresses').closest('details').open=false;await search('register monitor');$('[data-feature=monitor]').click();assert.equal($('#hwMonitorAddresses').closest('details').open,true);assert.equal(d.activeElement,$('#hwMonitorAddresses'));assert.ok(name(d.activeElement));
 });
 await check('register selection is exposed through an actual named action inside the table',()=>{
  w.AudioLab.navigate('registers');const row=$('#registerRows [data-address]');assert.ok(row);const action=row.matches('button,[role=button]')?row:row.querySelector('button,[role=button]');assert.ok(action,'Focusable table row has no action semantics');assert.equal(action.tagName,'BUTTON','The table action should use native button Enter/Space behavior');assert.ok(name(action));
  action.focus();action.click();const selected=$('#registerRows [data-address="'+row.dataset.address+'"] button');assert.ok(selected);assert.equal(selected.getAttribute('aria-pressed'),'true');assert.equal(d.activeElement,selected,'A register-table repaint must preserve the selected action focus');
 });
 await check('fixture-connected read progress and cancel remain named, exposed and recoverable',async()=>{
  w.AudioLab.navigate('hardware');$('#usbConnect').click();await wait(()=>d.body.dataset.hardware==='ready');assert.equal(device.writes,0);semanticInventory();
  const emit=device.emit.bind(device),queued=[];let hold=true;device.emit=(...args)=>hold?queued.push(args):emit(...args);
  try{
   $('#hwRead').click();await wait(()=>queued.length>0);assert.equal($('#hwCancel').hidden,false);assert.equal($('#hwCancel').disabled,false);assert.ok(shown($('#hwProgress')));assert.ok(name($('#hwProgress')),'Progress has no accessible name');assert.ok(name($('#hwCancel')));assert.equal($('#hwApply').disabled,true);
  }finally{
   $('#hwCancel').click();hold=false;for(const args of queued.splice(0))emit(...args);await wait(()=>$('#hwCancel').hidden);device.emit=emit;
  }
  assert.match(text($('#hwStatusDetail')),/cancel|取消/i);assert.equal(device.writes,0);
  $('#hwRead').click();await wait(()=>d.body.dataset.hardware==='ready');$('#hwDisconnect').click();await wait(()=>!device.opened);assert.equal($('#hwApply').disabled,true);
 });
 await check('status updates expose polite live regions and all synthetic flows avoid native I/O',()=>{
  for(const id of ['toast','captureStatus','hwStatus']){const el=d.getElementById(id);assert.ok(el.getAttribute('role')==='status'||el.getAttribute('aria-live')==='polite',id+' needs a live status role');}
  assert.deepEqual(errors,[]);assert.equal(calls.fixtureChooser,1);assert.equal(calls.nativeAudio,0);assert.equal(calls.media,0);assert.equal(calls.network,0);assert.equal(device.writes,0);
 });
 console.log(checks+' semantic/keyboard regression groups passed; '+failures.length+' failed; synthetic DOM only');
 if(failures.length){console.error(JSON.stringify(failures,null,2));process.exitCode=1;}
}finally{w.dispatchEvent(new w.Event('pagehide'));w.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
