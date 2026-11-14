/* Seeded, replayable software-only interaction monkey. Native I/O is forbidden. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'AC10x-Audio-Lab.html'),'utf8');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex'),bundleSHA256=hash(html);
const args=process.argv.slice(2),arg=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const outputRoot=path.resolve(arg('--output','C:/Users/Harvey/Desktop/Opensource Hardware/AC10x-Monkey-Review-20261114'));
const runDirectory=path.join(outputRoot,'seeded-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid);
fs.mkdirSync(runDirectory,{recursive:true});
const steps=Number(arg('--steps',120));if(!Number.isInteger(steps)||steps<1||steps>2000)throw Error('Invalid --steps');
const replayPath=arg('--replay',null),seedArg=arg('--seed',null),seedsArg=arg('--seeds',null);
const seeds=seedsArg!==null?seedsArg.split(',').map(Number):seedArg===null?[0xA101,0xA102,0x5304,0x5305,0x0717,0xC0FFEE,0x12345678,0x5EED2026]:[Number(seedArg)];
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const json=value=>JSON.parse(JSON.stringify(value));
class InvariantError extends Error{constructor(signature,message,details={}){super(message);this.signature=signature;this.details=details;}}
function invariant(condition,signature,message,details){if(!condition)throw new InvariantError(signature,message,details);}
function rng(seed){let state=seed>>>0||0x9e3779b9;return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};}
function make(){
  const calls={hid:0,usb:0,serial:0,media:0,audioConstruct:0,audioPlay:0,network:0},errors=[],downloads=[];
  const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(html,{url:'https://seeded-monkey.invalid/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
    w.scrollTo=()=>{};w.URL.createObjectURL=blob=>{downloads.push(blob);return'blob:monkey';};w.URL.revokeObjectURL=()=>{};
    w.Blob=class{constructor(parts,options){this.parts=parts;this.type=options?.type;}};
    w.HTMLAnchorElement.prototype.click=function(){};
    const denied=(key,name)=>{calls[key]++;throw Error('Native '+name+' forbidden by monkey harness');};
    Object.defineProperty(w.navigator,'hid',{value:{requestDevice:async()=>denied('hid','HID'),getDevices:async()=>denied('hid','HID enumeration'),addEventListener(){},removeEventListener(){}}});
    Object.defineProperty(w.navigator,'usb',{value:{requestDevice:async()=>denied('usb','USB'),getDevices:async()=>denied('usb','USB enumeration'),addEventListener(){},removeEventListener(){}}});
    Object.defineProperty(w.navigator,'serial',{value:{requestPort:async()=>denied('serial','serial'),getPorts:async()=>denied('serial','serial enumeration'),addEventListener(){},removeEventListener(){}}});
    Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>denied('media','media'),enumerateDevices:async()=>denied('media','media enumeration')}});
    for(const name of ['AudioContext','webkitAudioContext','OfflineAudioContext','webkitOfflineAudioContext','Audio'])w[name]=class{constructor(){denied('audioConstruct',name);}};
    w.HTMLMediaElement.prototype.play=function(){return Promise.reject((()=>{calls.audioPlay++;return Error('Native media playback forbidden');})());};
    w.fetch=async()=>denied('network','fetch');w.XMLHttpRequest=class{constructor(){denied('network','XMLHttpRequest');}};
    w.WebSocket=class{constructor(){denied('network','WebSocket');}};
  }});
  const w=dom.window,d=w.document,$=s=>d.querySelector(s);
  function click(el){assert.ok(el,'Missing click target');if(el.disabled)throw Error('Disabled target '+el.id);el.focus?.();el.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,cancelable:true,button:0}));el.click();}
  function key(el,name,extra={}){const e=new w.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...extra});el.dispatchEvent(e);return e;}
  function nav(view){click($('[data-workspace="'+(view==='route'?'overview':view)+'"]'));}
  function visible(el){
    if(!el||!el.isConnected)return false;
    for(let p=el;p&&p.nodeType===1;p=p.parentElement){
      if(p.hidden)return false;
      const style=w.getComputedStyle(p);if(style.display==='none'||style.visibility==='hidden')return false;
      if(p.tagName==='DETAILS'&&!p.open){const summary=[...p.children].find(x=>x.tagName==='SUMMARY');if(!summary?.contains(el))return false;}
    }
    return true;
  }
  function describeFocus(){const el=d.activeElement;return el?{tag:el.tagName,id:el.id,feature:el.dataset?.feature||null,view:el.closest?.('.view')?.id||null,hiddenAncestor:el.closest?.('[hidden]')?.id||null,closedDetails:el.closest?.('details:not([open])')?.id||el.closest?.('details:not([open])')?.className||null}:null;}
  function state(){return{config:json(w.AudioLab.getConfig()),preview:json(w.AudioLab.getAuditionConfig()),context:json(w.AudioLab.getContext()),reference:w.AudioLab.getReferenceMclk(),profile:$('#hwProfile').value,language:w.AudioI18n.getLanguage(),mode:d.body.dataset.graphMode,route:d.body.dataset.activeRoute,panelHidden:$('#settingsWindow').hidden,finderHidden:$('#featureFinder').hidden,workflow:d.body.dataset.workflow,guideStep:$('#guideWorkspace')?.dataset.step,guideGoal:$('#guideGoal')?.value,guidePreset:$('#guidePreset')?.value,title:w.AudioI18n.sourceText($('#inspectorTitle')),bodyNode:d.body.dataset.selectedNode,focus:describeFocus(),calls:{...calls}};}
  function check(){
    invariant(errors.length===0,'runtime-error','Uncaught page error',{errors:[...errors]});
    const s=state();try{w.AudioLab.validateConfig(s.config);w.AudioLab.validateConfig(s.preview);}catch(e){throw new InvariantError('invalid-model','Live draft or preview failed public validation',{error:e.message,state:s});}
    invariant(s.config.profile===s.profile,'profile-selector','Draft profile differs from register selector',{draft:s.config.profile,selector:s.profile});
    invariant(Number.isInteger(s.reference)&&s.reference>=1e6&&s.reference<=5e7,'invalid-reference','Shared reference is outside supported range',s);
    invariant($('#hwMclk').value===String(s.reference)&&$('#legacyExportMclk').value===String(s.reference),'reference-display','Reference input/export display disagree with shared value',s);
    invariant($('#legacyExportMclk').readOnly,'reference-duplicate-editor','Export reference unexpectedly became independently editable');
    if(!s.panelHidden){
      invariant(d.body.dataset.view===s.context.view,'context-view','Visible view marker disagrees with current context',s);
      invariant(s.bodyNode===s.context.node,'context-body-node','Visible node marker disagrees with current context',s);
      const expectedNode={eq:'eq',clock:'clock',hardware:'control',registers:'control'}[s.context.view];
      if(expectedNode)invariant(s.context.node===expectedNode,'context-node:'+s.context.view,'Workspace has a stale node',s);
      if(s.context.view==='dynamics'){
        invariant(['agc','hpf'].includes(s.context.node),'dynamics-node','Dynamics page has an unrelated node',s);
        invariant(s.title.startsWith(s.context.node.toUpperCase()),'dynamics-title','Dynamics title disagrees with edit context',s);
      }
      if(s.context.view==='path')invariant(s.title===(w.AudioI18n.sourceText($('#nodeInspector h3'))||'模块设置'),'node-title','Module heading disagrees with its inspector',s);
      if(s.context.view==='audio'){
        invariant(JSON.stringify(s.config.eq)===JSON.stringify(s.preview.eq),'stale-preview-eq','Visible preview uses old EQ',s);
        invariant(JSON.stringify(s.config.clock)===JSON.stringify(s.preview.clock),'stale-preview-clock','Visible preview uses old clock model',s);
      }
      if(s.context.view==='clock')for(const name of ['fs','bits','slot','slots','format','role']){
        invariant($('[data-bind="clock.'+name+'"]').value===String(s.config.clock[name]),'clock-control:'+name,'Clock selector differs from its coupled model',s);
      }
    }
    const svg=$('#routingSVG');invariant(Boolean(svg)&&s.route==='all','single-graph','Only the complete diagram should exist',s);
    invariant(!$('#routeViewSelect')&&!$('#view-route')&&!$('#guideWorkspace')&&!$('[data-route-focus]'),'duplicate-route-ui','Removed alternate route surfaces returned',s);
    invariant(Object.values(calls).every(n=>n===0),'native-io','A prohibited native API was attempted',{calls:{...calls}});
    const focused=d.activeElement;
    // body is a legal browser focus fallback. A focused hidden descendant is not.
    if(focused&&focused!==d.body&&focused!==d.documentElement){
      invariant(visible(focused),'focus-hidden:'+(focused.id||focused.dataset?.feature||focused.tagName),'Actual activeElement is hidden or in a folded/inactive region',{...s,classification:'JSDOM focus finding; requires real-browser confirmation'});
      if(!s.finderHidden)invariant($('#featureFinder').contains(focused),'focus-outside-search','Focus escaped the modal search',s);
    }
    return s;
  }
  async function apply(a){
    let unchanged=null;
    switch(a.kind){
      case'nav':nav(a.view);break;
      case'node':w.AudioLab.openNode(a.node);break;
      case'language':$('#languageSwitch').value=a.language;$('#languageSwitch').dispatchEvent(new w.Event('change',{bubbles:true}));break;
      case'quick-start':{const before=JSON.stringify(w.AudioLab.getConfig());assert.equal($('#quickStart').disabled,true);$('#quickStart').click();invariant(JSON.stringify(w.AudioLab.getConfig())===before,'offline-quick-start','Disconnected quick start changed the model');break;}
      case'fit':nav('overview');click($('#routeFit'));break;
      case'zoom':nav('overview');click($('#routeZoomIn'));break;
      case'pan':nav('overview');$('#canvasScroll').focus();key($('#canvasScroll'),'ArrowRight');break;
      case'eq':nav('eq');$('#eqPreset').value=a.preset;$('#eqPreset').dispatchEvent(new w.Event('change',{bubbles:true}));break;
      case'clock':{nav('clock');const el=$('[data-bind="clock.'+a.field+'"]');el.focus();el.value=String(a.value);el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}));el.blur();break;}
      case'number':{if(a.id==='hwMclk')nav('clock');else w.AudioLab.openNode('agc');const el=$('#'+a.id)||$('[data-bind="'+a.id+'"]');assert.ok(el);el.focus();el.value=a.value;el.dispatchEvent(new w.Event('input',{bubbles:true}));el.blur();break;}
      case'profile':nav('hardware');$('#hwProfile').value=a.profile;$('#hwProfile').dispatchEvent(new w.Event('change',{bubbles:true}));break;
      case'reset':$('.tools-menu').open=true;click($('#resetConfig'));break;
      case'json':{
        $('.tools-menu').open=true;click($('#importConfig'));if(a.invalid)unchanged={config:JSON.stringify(w.AudioLab.getConfig()),reference:w.AudioLab.getReferenceMclk()};
        const el=$('#configFile');Object.defineProperty(el,'files',{configurable:true,value:[{name:'monkey.json',size:a.text.length,text:async()=>a.text}]});el.dispatchEvent(new w.Event('change'));break;
      }
      case'agc':{
        if(a.fromHPF)w.AudioLab.openNode('hpf');$('.tools-menu').open=true;click($('#importLegacyPreset'));if(a.invalid)unchanged={config:JSON.stringify(w.AudioLab.getConfig()),reference:w.AudioLab.getReferenceMclk()};
        const el=$('#legacyPresetFile');Object.defineProperty(el,'files',{configurable:true,value:[{name:'monkey.AC102',size:a.text.length,text:async()=>a.text}]});el.dispatchEvent(new w.Event('change'));break;
      }
      case'search-open':click($('#openFeatureFinder'));break;
      case'search-query':if($('#featureFinder').hidden)click($('#openFeatureFinder'));$('#featureQuery').focus();$('#featureQuery').value=a.query;$('#featureQuery').dispatchEvent(new w.Event('input',{bubbles:true}));break;
      case'search-enter':if(!$('#featureFinder').hidden){$('#featureQuery').focus();key($('#featureQuery'),'Enter');}break;
      case'search-tab':{
        if($('#featureFinder').hidden)break;const focusable=[$('#closeFeatureFinder'),$('#featureQuery'),...$('#featureResults').querySelectorAll('button')];
        const event=key(d.activeElement,'Tab',{shiftKey:a.reverse});if(!event.defaultPrevented){const i=focusable.indexOf(d.activeElement),next=(i+(a.reverse?-1:1)+focusable.length)%focusable.length;focusable[next].focus();}break;
      }
      case'search-arrow':if(!$('#featureFinder').hidden)key(d.activeElement,a.key);break;
      case'escape':key(d.activeElement||d,'Escape');break;
      case'close':if(!$('#settingsWindow').hidden)click($('#closeSettings'));break;
      case'menu':click($('.tools-menu>summary'));break;
      default:throw Error('Unknown replay action '+a.kind);
    }
    await tick();await tick();
    if(unchanged)invariant(JSON.stringify(w.AudioLab.getConfig())===unchanged.config&&w.AudioLab.getReferenceMclk()===unchanged.reference,'invalid-import-mutated','Rejected import changed the live model',{action:a,before:unchanged,after:state()});
    return check();
  }
  return{w,d,$,state,check,apply,calls,close(){w.dispatchEvent(new w.Event('pagehide'));w.close();}};
}
const agcText='AGC\nTargetLevel = -14, NoiseThreshold = -70, MaxGain = 20\nAGCTime(ms)\nDecayTime = 999, AttackTime = 999\nDecayTimeReg = 5F, AttackTimeReg = 1F, SignalDebounceTimeReg = 5, NoiseDebounceTimeReg = C';
function nextAction(world,random){
  const pick=list=>list[Math.floor(random()*list.length)],{w,$}=world;
  if(!$('#featureFinder').hidden){
    const kind=pick(['search-query','search-query','search-enter','escape','search-tab','search-arrow']);
    if(kind==='search-query'){const shown=[...$('#featureResults').querySelectorAll('button')].map(el=>el.textContent.trim());return{kind,query:pick(['','HPF','AGC','MCLK','USB','导出','zzzz',...shown])};}
    if(kind==='search-tab')return{kind,reverse:random()<.4};if(kind==='search-arrow')return{kind,key:pick(['ArrowDown','ArrowUp'])};return{kind};
  }
  const kind=pick(['nav','nav','node','node','language','quick-start','fit','zoom','pan','eq','eq','clock','clock','number','number','profile','reset','json','json','agc','search-open','search-open','close','escape','menu']);
  if(kind==='nav')return{kind,view:pick(['overview','route','eq','dynamics','clock','hardware','registers','audio'])};
  if(kind==='node')return{kind,node:pick(['pga','input','bias','adcvol','dacvol','lineamp','dacmix','hpf','agc','clock','eq','control','rxmix','txmap'])};
  if(kind==='language')return{kind,language:pick(['zh-CN','en'])};
  if(kind==='eq')return{kind,preset:pick(w.AudioExamples.eqPresets).id};
  if(kind==='clock'){const choices={fs:[8000,16000,24000,44100,48000],bits:[16,20,24],slot:[16,24,32],slots:[1,2],format:['I2S','PCM','LJ','RJ'],role:['slave','master']},field=pick(Object.keys(choices));return{kind,field,value:pick(choices[field])};}
  if(kind==='number'){const id=pick(['hwMclk','agc.attack','agc.release']);return{kind,id,value:pick(id==='hwMclk'?['12288000','24576000','12000000','8000000','0','','50000001','1.5']:['0.01','0.7','2','120','8192','0','','10000','-1'])};}
  if(kind==='profile')return{kind,profile:pick(['AC101S','AC102'])};
  if(kind==='json'){
    const c=json(w.AudioLab.getConfig()),invalid=random()<.4;
    c.profile=pick(['AC101S','AC102']);c.pga=Math.floor(random()*32);c.eq.preGain=-Math.floor(random()*13);
    c.clock.fs=pick([16000,24000,48000]);for(const band of c.eq.bands)band.freq=Math.min(band.freq,c.clock.fs*.4);
    const doc={format:'AC10x-configuration',schemaVersion:1,referenceMclkHz:pick([12288000,24576000,8000000]),config:c};
    return{kind,invalid,text:invalid?pick(['{','{}',JSON.stringify({...doc,schemaVersion:77}),JSON.stringify({...doc,referenceMclkHz:0})]):JSON.stringify(doc)};
  }
  if(kind==='agc'){const invalid=random()<.3;return{kind,invalid,fromHPF:random()<.75,text:invalid?agcText.replace('NoiseThreshold = -70','NoiseThreshold = -71'):agcText};}
  return{kind};
}
function errorRecord(error,world,index,action){return{index,action,signature:error.signature||'exception:'+error.message,message:error.message,details:error.details||null,state:world.state(),stack:error.stack};}
const focusFinding=error=>String(error.signature||'').startsWith('focus-hidden:');
async function replay(actions,{ignoreFocus=false,targetSignature=null}={}){const world=make(),warnings=[];try{await tick();world.check();for(let i=0;i<actions.length;i++)try{await world.apply(actions[i]);}catch(error){if(focusFinding(error)&&(ignoreFocus||(targetSignature&&error.signature!==targetSignature))){warnings.push({index:i,signature:error.signature,focus:world.state().focus});continue;}return{passed:false,failure:errorRecord(error,world,i,actions[i]),calls:{...world.calls},warnings};}return{passed:true,calls:{...world.calls},warnings};}finally{world.close();}}
async function minimize(actions,signature){
  let current=actions.slice(),n=2,trials=0;
  while(current.length>1&&trials<32){const size=Math.ceil(current.length/n);let reduced=false;
    for(let start=0;start<current.length&&trials<32;start+=size){const candidate=current.slice(0,start).concat(current.slice(start+size));if(!candidate.length)continue;trials++;const result=await replay(candidate,{ignoreFocus:!signature.startsWith('focus-hidden:'),targetSignature:signature});if(!result.passed&&result.failure.signature===signature){current=candidate;n=Math.max(2,n-1);reduced=true;break;}}
    if(!reduced){if(n>=current.length)break;n=Math.min(current.length,n*2);}
  }
  const confirmation=await replay(current,{ignoreFocus:!signature.startsWith('focus-hidden:'),targetSignature:signature});return{actions:current,trials,confirmed:!confirmation.passed&&confirmation.failure.signature===signature,failure:confirmation.failure||null,minimality:'ddmin within 32 replay trials'};
}
(async()=>{
  const summary={mode:'Seeded synthetic DOM monkey; NOT actual browser or hardware evidence',focusPolicy:'Hidden focus is recorded and minimized for native-browser confirmation; never normalized or silently counted as proven correct',bundleSHA256,startedAt:new Date().toISOString(),runDirectory,requestedSeeds:seeds,requestedStepsPerSeed:steps,runs:[],status:'PASSED'};
  if(replayPath){const packet=JSON.parse(fs.readFileSync(path.resolve(replayPath),'utf8'));const result=await replay(packet.actions,{ignoreFocus:!String(packet.signature||'').startsWith('focus-hidden:'),targetSignature:packet.signature||null});summary.runs.push({replayPath,result});summary.status=result.passed?(result.warnings.length?'PASSED_WITH_FOCUS_WARNINGS':'PASSED'):'FAILED';}
  else{
    const minimized=new Map();
    for(const seed of seeds){
      const world=make(),random=rng(seed),actions=[],focusWarnings=[];let failure=null;
      console.log('START seed '+seed+' steps '+steps);
      try{await tick();world.check();for(let i=0;i<steps;i++){const action=nextAction(world,random);actions.push(action);try{await world.apply(action);}catch(error){if(focusFinding(error)){const warning=errorRecord(error,world,i,action);if(!focusWarnings.some(v=>v.signature===warning.signature))console.log('FOCUS-WARNING seed '+seed+' step '+i+' '+warning.signature);focusWarnings.push(warning);}else{failure=errorRecord(error,world,i,action);break;}}if((i+1)%25===0)console.log('PROGRESS seed '+seed+' step '+(i+1));}}
      catch(error){failure=errorRecord(error,world,-1,null);}
      const run={seed,actions,completedSteps:failure?Math.max(0,failure.index):actions.length,failure,focusWarnings,calls:{...world.calls},finalState:world.state()};world.close();
      if(failure){summary.status='FAILED';console.log('FAIL seed '+seed+' step '+failure.index+' '+failure.signature);
        if(!minimized.has(failure.signature)){
          const result=await minimize(actions,failure.signature),file=path.join(runDirectory,'minimized-'+minimized.size+'.json');
          fs.writeFileSync(file,JSON.stringify({seed,bundleSHA256,signature:failure.signature,...result},null,2));minimized.set(failure.signature,file);console.log('MINIMIZED '+result.actions.length+' actions confirmed='+result.confirmed+' '+file);
        }
        run.minimizedFile=minimized.get(failure.signature);
      }else console.log('PASS-STRUCTURE seed '+seed+' completed '+actions.length+' software-only actions; focus warnings '+focusWarnings.length);
      if(focusWarnings.length&&summary.status==='PASSED')summary.status='PASSED_WITH_FOCUS_WARNINGS';
      for(const warning of focusWarnings)if(!minimized.has(warning.signature)){
        const result=await minimize(actions.slice(0,warning.index+1),warning.signature),file=path.join(runDirectory,'focus-candidate-'+minimized.size+'.json');
        fs.writeFileSync(file,JSON.stringify({seed,bundleSHA256,signature:warning.signature,classification:'JSDOM candidate; native-browser confirmation required',...result},null,2));minimized.set(warning.signature,file);console.log('FOCUS-CANDIDATE '+result.actions.length+' actions confirmed='+result.confirmed+' '+file);
      }
      run.focusCandidateFiles=[...new Set(focusWarnings.map(v=>minimized.get(v.signature)))];
      const file=path.join(runDirectory,'seed-'+seed.toString(16)+'.json');fs.writeFileSync(file,JSON.stringify(run,null,2));summary.runs.push({seed,actions:actions.length,completedSteps:run.completedSteps,signature:failure?.signature||null,focusWarningCount:focusWarnings.length,focusCandidateFiles:run.focusCandidateFiles,reportFile:file,minimizedFile:run.minimizedFile||null,calls:run.calls});
    }
  }
  summary.completedAt=new Date().toISOString();fs.writeFileSync(path.join(runDirectory,'summary.json'),JSON.stringify(summary,null,2));fs.writeFileSync(path.join(outputRoot,'monkey-summary-latest.json'),JSON.stringify(summary,null,2));
  console.log(JSON.stringify({status:summary.status,bundleSHA256,runDirectory,runs:summary.runs.map(r=>({seed:r.seed,completedSteps:r.completedSteps,signature:r.signature,focusWarningCount:r.focusWarningCount,calls:r.calls})),hardware:'NOT ACCESSED'}));
  if(summary.status==='FAILED')process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
