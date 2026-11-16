/* Regressions found during user-flow review. Synthetic DOM only; no native I/O. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
let count=0;const pass=name=>{count++;console.log('PASS '+name);};
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
const agc='AGC\nTargetLevel = -14, NoiseThreshold = -70, MaxGain = 20\nAGCTime(ms)\nDecayTime = 999, AttackTime = 999\nDecayTimeReg = 5F, AttackTimeReg = 1F, SignalDebounceTimeReg = 5, NoiseDebounceTimeReg = C';
const errors=[],blobs=[],calls={hid:0,audio:0,media:0},vc=new VirtualConsole();
vc.on('jsdomError',error=>errors.push(error.message));
const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../AC10x-Audio-Lab.html'),'utf8'),{
  url:'https://ui-review.invalid/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
  beforeParse(w){
    w.scrollTo=()=>{};
    w.Blob=class{constructor(parts){this.parts=parts;}};
    w.URL.createObjectURL=blob=>{blobs.push(blob);return'blob:review';};
    w.URL.revokeObjectURL=()=>{};
    w.HTMLAnchorElement.prototype.click=function(){};
    w.AudioContext=class{constructor(){calls.audio++;throw Error('Native audio forbidden in UI review regression');}};
    Object.defineProperty(w.navigator,'hid',{value:{
      async requestDevice(){calls.hid++;throw Error('Native HID forbidden in UI review regression');},
      addEventListener(){},removeEventListener(){}
    }});
    Object.defineProperty(w.navigator,'mediaDevices',{value:{
      async getUserMedia(){calls.media++;throw Error('Native media forbidden in UI review regression');},
      async enumerateDevices(){calls.media++;throw Error('Device enumeration forbidden in UI review regression');}
    }});
  }
});
const w=dom.window,d=w.document,$=selector=>d.querySelector(selector);
function key(target,name,extra={}){const event=new w.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...extra});target.dispatchEvent(event);return event;}
async function search(text){
  if($('#featureFinder').hidden)$('#openFeatureFinder').click();
  $('#featureQuery').value=text;
  $('#featureQuery').dispatchEvent(new w.Event('input',{bubbles:true}));
  await tick();
}
function choose(id){const button=$('[data-feature="'+id+'"]');assert.ok(button,'Expected feature '+id);button.click();}
function visible(element){
  if(!element||!element.isConnected)return false;
  for(let el=element;el&&el.nodeType===1;el=el.parentElement){
    if(el.hidden)return false;
    const style=w.getComputedStyle(el);if(style.display==='none'||style.visibility==='hidden')return false;
  }
  return true;
}
(async()=>{try{
  w.AudioLab.navigate('hardware');
  $('#hwProfile').value='AC102';$('#hwProfile').dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(w.AudioLab.getConfig().profile,'AC102');
  $('#resetConfig').click();
  assert.equal(w.AudioLab.getConfig().profile,'AC101S');assert.equal($('#hwProfile').value,'AC101S');
  $('#exportConfig').click();const exported=JSON.parse(blobs.at(-1).parts.join(''));
  assert.equal(exported.config.profile,$('#hwProfile').value);
  pass('restoring the example synchronizes the register selector and exported draft profile');

  for(const [view,node,title] of [['eq','eq',/EQ/],['clock','clock',/时钟/]]){
    w.AudioLab.navigate(view);$('#resetConfig').click();
    assert.equal(w.AudioLab.getContext().view,view);assert.equal(w.AudioLab.getContext().node,node);
    assert.equal(d.body.dataset.selectedNode,node);assert.match($('#inspectorTitle').textContent,title);
  }
  pass('example reset preserves the active EQ or clock workspace and its matching node/title');

  w.AudioLab.openNode('hpf');assert.match($('#inspectorTitle').textContent,/HPF/);
  Object.defineProperty($('#legacyPresetFile'),'files',{configurable:true,value:[{name:'review-AGC.AC102',size:agc.length,text:async()=>agc}]});
  $('#legacyPresetFile').dispatchEvent(new w.Event('change'));await tick();
  assert.equal(w.AudioLab.getConfig().agc.release,2);
  assert.equal(w.AudioLab.getContext().view,'dynamics');assert.equal(w.AudioLab.getContext().node,'agc');
  assert.equal(d.body.dataset.selectedNode,'agc');assert.match($('#inspectorTitle').textContent,/AGC/);
  assert.doesNotMatch($('#inspectorTitle').textContent,/HPF/);
  pass('importing a valid AGC file from HPF aligns title, body node and actual edit context');

  w.AudioI18n.setLanguage('en');await search('');
  const labels=[...d.querySelectorAll('#featureResults [data-feature]')].map(el=>({id:el.dataset.feature,label:el.textContent.trim()}));
  assert.equal(labels.length,33);
  for(const entry of labels){
    assert.ok(!/[\u3400-\u9fff]/.test(entry.label),entry.label);
    await search(entry.label);
    assert.ok($('[data-feature="'+entry.id+'"]'),'Displayed English name cannot find '+entry.id+': '+entry.label);
  }
  pass('every displayed English feature name can be searched verbatim to find its own entry');

  await search('EQ');$('#featureQuery').focus();key($('#featureQuery'),'Enter');await tick();
  assert.equal($('#featureFinder').hidden,true);assert.equal(w.AudioLab.getContext().view,'eq');
  assert.ok(visible(d.activeElement),'Keyboard destination must be visible');
  assert.notEqual(d.activeElement,d.body);assert.ok(!$('#featureFinder').contains(d.activeElement));
  assert.ok($('#settingsWindow').contains(d.activeElement),'Focus should enter the opened workspace');
  pass('Enter on a feature search moves focus into a visible destination instead of a hidden result');

  await search('AGC');const query=$('#featureQuery');query.focus();
  for(const name of ['ArrowDown','ArrowUp']){
    const event=key(query,name,{isComposing:true});
    assert.equal(event.defaultPrevented,false,'IME '+name+' must retain its native action');
    assert.equal(d.activeElement,query);
  }
  const legacyIme=key(query,'ArrowDown',{keyCode:229});assert.equal(legacyIme.defaultPrevented,false);assert.equal(d.activeElement,query);
  assert.equal($('#featureFinder').hidden,false);key(query,'Escape');
  pass('IME composing arrows and legacy keyCode 229 do not consume navigation or move input focus');

  const menu=$('.tools-menu');
  for(const selector of ['#importConfig','#exportConfig','#importLegacyPreset','#resetConfig']){
    menu.open=true;$(selector).click();assert.equal(menu.open,false,'Menu stayed open after '+selector);
  }
  assert.equal($('.tools-menu [data-view="registers"]'),null);assert.equal($('.tools-menu [data-view="audio"]'),null);
  menu.open=true;$('[data-workspace="registers"]').click();assert.equal(menu.open,false,'Workspace navigation must close an open file menu');
  pass('file-menu actions close the menu after imports, export, reset and workspace navigation');

  const release=$('#releaseInfo');assert.equal(release.tagName,'DETAILS');release.open=false;
  await search('version');choose('release');await tick();
  assert.equal(w.AudioLab.getContext().view,'hardware');assert.equal(release.open,true);
  assert.ok(visible(release));assert.ok(!$('#featureFinder').contains(d.activeElement));
  pass('version/support feature reveals its collapsed destination automatically');

  // Programmatic typing dispatches input, but deliberately no change event.
  // Native blur emits blur/focusout, matching browsers that omit change on Tab.
  function blurInvalid(el,value){
    let changeEvents=0;const onChange=()=>changeEvents++;
    el.addEventListener('change',onChange);el.focus();el.value=value;
    el.dispatchEvent(new w.Event('input',{bubbles:true}));el.blur();
    el.removeEventListener('change',onChange);assert.equal(changeEvents,0);
  }
  w.AudioLab.setReferenceMclk(24576000);w.AudioLab.navigate('clock');
  for(const invalid of ['0','']){
    blurInvalid($('#hwMclk'),invalid);
    assert.equal($('#hwMclk').value,'24576000');
    assert.equal(w.AudioLab.getReferenceMclk(),24576000);
    assert.equal($('#legacyExportMclk').value,'24576000');
    assert.match($('#clockMetrics').textContent,/24\.576/);
  }
  w.AudioLab.openNode('agc');
  for(const field of ['attack','release']){
    const baseline=w.AudioLab.getConfig().agc[field],el=$('[data-bind="agc.'+field+'"]');
    for(const invalid of ['0','']){
      blurInvalid(el,invalid);assert.notEqual(el.value,'');
      assert.equal(Number(el.value),baseline);assert.equal(w.AudioLab.getConfig().agc[field],baseline);
    }
  }
  pass('invalid or empty numeric edits restore on blur/focusout even when no change event fires');

  w.AudioI18n.setLanguage('zh-CN');w.AudioLab.navigate('clock');await tick();
  assert.equal($('#routeViewSelect'),null);assert.equal($('#routeResetView'),null);assert.equal($('#view-route'),null);assert.equal($('#routeExamplesOpen'),null);assert.equal($('#guideWorkspace'),null);
  const original=JSON.stringify(w.AudioLab.getConfig());for(const page of ['clock','eq','hardware','registers','audio']){w.AudioLab.navigate(page);assert.equal(d.body.dataset.activeRoute,'all');assert.ok($('#routingSVG [data-node="eq"]'));assert.ok($('#routingSVG [data-node="adc"]'));assert.ok($('#routingSVG [data-node="dacmix"]'));assert.equal(JSON.stringify(w.AudioLab.getConfig()),original);}
  assert.equal($('#quickStart').disabled,false);$('#quickStart').click();assert.equal($('#quickStartPicker').hidden,false);assert.ok([...d.querySelectorAll('[data-quick-apply]')].every(b=>b.disabled));$('#closeQuickStart').click();assert.equal(JSON.stringify(w.AudioLab.getConfig()),original);pass('one full graph persists across every editor; disconnected Quick Start cannot write or mutate draft');

  assert.deepEqual(calls,{hid:0,audio:0,media:0});assert.deepEqual(errors,[]);
  pass('all review regression flows complete without native HID, audio, microphone or device enumeration');
  console.log(count+' UI-review regression checks; synthetic DOM only, no hardware I/O');
}finally{w.dispatchEvent(new w.Event('pagehide'));w.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
