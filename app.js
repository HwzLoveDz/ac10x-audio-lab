/* Local editor and audition. Explicit hardware I/O is owned by transport/session/hardware. */
(() => {
  'use strict';
  const D=AudioDSP, R=AudioRouting, C=AudioCodec,E=AudioExamples, $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
  const clone=x=>JSON.parse(JSON.stringify(x)), colors=['var(--band1)','var(--band2)','var(--band3)'];
  const storageKey='ac10x-audio-lab-v1';
  const routeUI={focus:'all',zoom:1,fit:true,mode:'professional',associate:false};
  const viewport=new AudioViewport.Canvas($('#canvasScroll'),$('#routeDiagram'),{onChange(state){$('#routingPanel').dataset.canvasSize=state.width<600?'narrow':state.width<900?'medium':'wide';routeUI.zoom=state.scale;routeUI.fit=state.autoFit;$('#routeZoomValue').textContent=Math.round(state.scale*100)+'%';$('#routeFit').setAttribute('aria-pressed',String(state.autoFit));}});
  window.addEventListener('pagehide',()=>viewport.destroy(),{once:true});
  const defaults=()=>E.defaultFirmware(C.normalize({routing:R.defaults(),version:1,profile:'AC101S',pga:12,adc:{enabled:true,gain:0},dac:{enabled:true,gain:0},hpf:{enabled:true,freq:80},agc:{enabled:true,target:-14,threshold:-70,maxGain:20,attack:0.7,release:120,debounce:1.3},eq:E.eq('voice',48000),clock:{fs:48000,format:'I2S',bits:24,slot:32,slots:2,role:'slave'},raw:{}}),{fixedAudio:true});
  let cfg=defaults(), applied, currentView='path', selectedNode='pga', selectedReg=0x31, preset='voice',hardwareSnapshot=null,hardwareConnected=false,lastRouteExample=null,referenceMclkHz=12288000,draftRevision=0,draftImportRequest=0;
  const draftInputRequests=new WeakMap();
  let viewRevision=0;
  let toastTimer, dragging=-1, importedName='', audioOrigin='generated', audioChannels=[], audioFs=48000, audioWet=false, audioContext=null, playback=null, monitorGain=null, wetCache=null,audioEpoch=0;
  const names={path:['COMPLETE SIGNAL ROUTING','完整音频路径总览','输入选择、四组混音、监听与数字回环，完整显示连接关系。','音频路径'],eq:['PARAMETRIC EQUALIZER','让每一段频率，各就其位。','三段双二阶滤波器，实时查看频率响应与系数。','三段 EQ'],dynamics:['DYNAMICS & FILTERS','控制动态，保留细节。','编辑自动增益与高通参数，查看本地数学示意。','AGC / HPF'],clock:['CLOCK & SERIAL AUDIO','把时钟和数据，对齐。','从采样率到时隙宽度，一起检查数字音频配置。','时钟与接口'],registers:['REGISTER WORKSPACE','每一个位，都有迹可循。','参数生成与手动编辑分开显示，应用前检查本地差异。','寄存器'],hardware:['HARDWARE CONNECTION','连接真实设备，读回每一次修改。','USB HID 控制适配器 → I²C 音频芯片。下发参数后逐项核验实际寄存器。','设备连接'],audio:['LISTEN & COMPARE','调过的参数，用耳朵确认。','生成或导入音频，在浏览器内对比播放端 EQ。','音频实验']};
  const fmtHz=f=>f>=1000?(f/1000).toFixed(f%1000?1:0)+'k':String(Math.round(f));
  const hex=(n,width=2)=>'0x'+(n>>>0).toString(16).toUpperCase().padStart(width,'0');
  const signed=v=>(v>0?'+':'')+Number(v).toFixed(1);
  function get(path,obj=cfg){return path.split('.').reduce((o,k)=>o[k],obj);}
  function put(path,value,obj=cfg){const p=path.split('.'),key=p.pop();p.reduce((o,k)=>o[k],obj)[key]=value;}
  function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4000);}
  function save(){try{localStorage.setItem(storageKey,JSON.stringify({draft:cfg,applied,referenceMclkHz:referenceMclkHz}));}catch{}}
  function validate(c){
    c=AudioDebug.parseConfig(c);if(c.profile==='AC102-reference')c.profile='AC102';
    if(!['adc','dac','hpf','agc','eq','clock'].every(k=>c[k]&&typeof c[k]==='object'))throw new Error('配置结构不完整');
    R.normalize(c);C.normalize(c);R.validate(c);
    const n=(p,min,max)=>{const x=get(p,c);if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max)throw new Error(p+' 数值超出范围');};
    const b=p=>{if(typeof get(p,c)!=='boolean')throw new Error(p+' 必须是布尔值');};
    n('pga',0,31);if(!Number.isInteger(c.pga))throw new Error('PGA 必须为整数');
    ['adc','dac'].forEach(x=>{b(x+'.enabled');n(x+'.gain',-64,63);b(x+'.mute');});
    b('hpf.enabled');n('hpf.freq',.1,1000);b('agc.enabled');n('agc.target',-30,-1);n('agc.threshold',-90,-30);n('agc.maxGain',0,40);n('agc.attack',.01,8192);n('agc.release',.01,8192);n('agc.debounce',0,8192);n('agc.noiseDebounce',0,8192);b('agc.noiseDetect');
    if(![8000,11025,12000,16000,22050,24000,32000,44100,48000].includes(c.clock.fs)||![16,20,24].includes(c.clock.bits)||![16,24,32].includes(c.clock.slot)||![1,2].includes(c.clock.slots)||!['I2S','PCM','LJ','RJ'].includes(c.clock.format)||!['master','slave'].includes(c.clock.role))throw new Error('时钟或接口参数无效');
    if(c.clock.slot<c.clock.bits)throw new Error('时隙宽度必须大于或等于有效位数');
    if(c.clock.format!=='PCM'&&c.clock.slots!==2)throw new Error('I²S / 左右对齐需要两个时隙');
    b('eq.enabled');n('eq.preGain',-18,0);
    if(!Array.isArray(c.eq.bands)||c.eq.bands.length!==3)throw new Error('需要恰好三段 EQ');
    c.eq.bands.forEach((x,i)=>{const p='eq.bands.'+i;b(p+'.enabled');n(p+'.freq',20,Math.min(20000,c.clock.fs/2-1));n(p+'.gain',-15,15);n(p+'.q',.1,10);if(!['peaking','lowshelf','highshelf','lowpass','highpass'].includes(x.type))throw new Error('滤波器类型无效');});
    if(!c.raw||Array.isArray(c.raw)||typeof c.raw!=='object')throw new Error('寄存器镜像格式无效');
    Object.entries(c.raw).forEach(([k,v])=>{if(!/^\d+$/.test(k)||Number(k)<0||Number(k)>126||!Number.isInteger(v)||v<0||v>255)throw new Error('寄存器镜像数值无效');});
    return c;
  }
  try{const saved=JSON.parse(localStorage.getItem(storageKey));if(saved){cfg=validate(saved.draft);applied=validate(saved.applied);preset='custom';if(saved.referenceMclkHz)setReferenceMclk(saved.referenceMclkHz,false);}}catch{cfg=defaults();}
  applied=applied||clone(cfg);$('#legacyExportMclk').value=$('#hwMclk').value;

  function syncControls(){
    $$('[data-bind]').forEach(el=>{const value=get(el.dataset.bind);if(el.type==='checkbox')el.checked=value;else if(document.activeElement!==el)el.value=value;});
    $$('[data-value]').forEach(el=>el.textContent=get(el.dataset.value)+(el.dataset.unit?' '+el.dataset.unit:''));
    const dirty=!R.equivalent(cfg,applied);
    $('#draftStatus').textContent=dirty?'待更新试听':'已更新试听';$('#draftStatus').classList.toggle('dirty',dirty);
    $('#applyModel').disabled=!dirty;
    $('#summaryFs').innerHTML=(cfg.clock.fs/1000).toFixed(cfg.clock.fs%1000?3:1)+' <small>kHz</small>';
    const format={I2S:'I²S',PCM:'PCM',LJ:'LJ',RJ:'RJ'}[cfg.clock.format];
    $('#summaryFormat').innerHTML=format+' <small>/ '+cfg.clock.bits+' bit</small>';
    $('#summaryEQ').innerHTML=(cfg.eq.enabled?cfg.eq.bands.filter(b=>b.enabled).length:0)+' <small>段启用</small>';
    $('#preGainValue').textContent=signed(cfg.eq.preGain)+' dB';
    $('#eqPreset').value=preset;const eqInfo=E.eqPresets.find(p=>p.id===preset);$('#eqPresetNote').textContent=eqInfo?eqInfo.note+' 前级 '+cfg.eq.preGain+' dB。'+(eqInfo.bands.some(b=>b.freq>cfg.clock.fs*.4)?'高频点已按当前采样率收低。':''):'自定义三段EQ；曲线与系数随草稿更新。';$$('[data-band-index]').forEach(el=>el.dataset.filter=cfg.eq.bands[Number(el.dataset.bandIndex)].type);
  }
  function closeSettings(){
    const restoreFocus=$('#settingsWindow').contains(document.activeElement);
    viewRevision++;
    currentView='path';document.body.dataset.view='path';
    $('#settingsWindow').hidden=true;document.body.dataset.inspectorOpen='false';
    history.replaceState(null,'','#path');renderRoute();if(restoreFocus)$('#canvasScroll').focus({preventScroll:true});window.dispatchEvent(new Event('audiolab:viewchange'));
  }
  function setView(view){
    if(view==='route'){closeSettings();return;}
    if(!names[view])return;viewRevision++;if(view==='audio')try{prepareAudition();}catch(e){toast(e.message);}currentView=view;
    if(view==='eq')selectedNode='eq';if(view==='clock')selectedNode='clock';if(view==='hardware'||view==='registers')selectedNode='control';
    if(view==='dynamics'&&!['hpf','agc'].includes(selectedNode))selectedNode='agc';
    $$('.view').forEach(el=>el.classList.toggle('active',el.id==='view-'+(view==='path'?'node':view)));
    $('#settingsWindow').hidden=false;document.body.dataset.inspectorOpen='true';document.body.dataset.view=view;document.body.dataset.selectedNode=selectedNode;
    renderInspector();$('#inspectorTitle').textContent=view==='path'?(AudioI18n.sourceText($('#nodeInspector h3'))||'模块设置'):view==='dynamics'?(selectedNode==='hpf'?'HPF · 一阶高通':'AGC · 自动增益'):names[view][3];
    $('#selectedType').textContent=view==='path'?R.inspector(selectedNode,cfg).kind:{eq:'PLAYBACK · EQ',dynamics:'RECORD · DSP',clock:'CLOCK & I²S',hardware:'USB HID · I²C',registers:'DEVICE REGISTERS',audio:'BROWSER AUDITION',route:'CHAIN VIEW · LOCAL DRAFT'}[view];
    $('#settingsBody').scrollTop=0;history.replaceState(null,'','#'+view);render();
    $$('.tools-menu').forEach(el=>el.open=false);window.dispatchEvent(new Event('audiolab:viewchange'));
  }
  $$('[data-view]').forEach(el=>el.addEventListener('click',()=>setView(el.dataset.view)));
  $('#closeSettings').addEventListener('click',closeSettings);
  $('.workbench-brand').addEventListener('click',e=>{e.preventDefault();closeSettings();});
  window.addEventListener('hashchange',()=>location.hash==='#path'?closeSettings():setView(location.hash.slice(1)));
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.tools-menu'))$$('.tools-menu').forEach(menu=>menu.open=false);});
  document.addEventListener('click',e=>{const source=e.target.closest('.tools-menu button');if(!source)return;const restoreFocus=source.closest('.tools-menu').contains(document.activeElement);$$('.tools-menu').forEach(menu=>menu.open=false);if(restoreFocus){const target=$('#settingsWindow').hidden?$('#canvasScroll'):$('#inspectorTitle');target.tabIndex=-1;target.focus({preventScroll:true});}});
  document.addEventListener('keydown',e=>{if(e.isComposing||e.keyCode===229||e.key!=='Escape')return;const menus=$$('.tools-menu[open]');if(menus.length){menus.forEach(menu=>menu.open=false);e.preventDefault();return;}if(!$('#settingsWindow').hidden)closeSettings();});
  function prepareAudition(force=false){if(!force&&R.equivalent(cfg,applied))return;validate(cfg);applied=clone(cfg);wetCache=null;stopAudio();if(!importedName)generateSignal(false);save();}
  function setReferenceMclk(value,notify=true){if(!Number.isInteger(value)||value<1000000||value>50000000)throw Error('MCLK参考范围为1至50MHz');if(notify&&value!==referenceMclkHz)draftRevision++;referenceMclkHz=value;$('#hwMclk').value=String(value);$('#legacyExportMclk').value=String(value);if(notify){render();save();window.dispatchEvent(new Event('audiolab:referenceclockchange'));}}
  $('#hwMclk').addEventListener('input',e=>{if(e.target.validity.valid&&e.target.value)setReferenceMclk(Number(e.target.value));});
  function commitReferenceMclk(e){try{setReferenceMclk(Number(e.target.value));}catch(error){setReferenceMclk(referenceMclkHz,false);toast(error.message);}}
  $('#hwMclk').addEventListener('change',commitReferenceMclk);
  $('#hwMclk').addEventListener('blur',commitReferenceMclk);
  function clearImportNotice(){$('#importMessage').hidden=true;$('#importMessageText').textContent='';$('#legacyPresetInfo').textContent='通过“文件与工具”导入原厂 EQ / AGC .AC102；按当前草稿Fs重算，不会自动写入。';}
  function changed({routeExample=null}={}){draftRevision++;clearImportNotice();lastRouteExample=routeExample;if(currentView==='audio')try{prepareAudition();}catch{};syncControls();render();save();window.dispatchEvent(new Event('audiolab:configchange'));}
  document.addEventListener('input',event=>{
    const el=event.target,path=el.dataset.bind;if(!path)return;
    let value=el.type==='checkbox'?el.checked:(el.type==='range'||el.type==='number'||el.dataset.kind==='number'||['clock.fs','clock.bits','clock.slot','clock.slots'].includes(path)?Number(el.value):el.value);
    if(el.type==='number'&&(el.value===''||!el.validity.valid))return;
    put(path,value);
    if(path==='clock.bits'&&cfg.clock.slot<value)cfg.clock.slot=value<=24?24:32;
    if(path==='clock.slot'&&cfg.clock.bits>value)cfg.clock.bits=value>=24?24:16;
    if(path==='clock.slots'&&value===1)cfg.clock.format='PCM';
    if(path==='clock.format'&&value!=='PCM')cfg.clock.slots=2;
    if(path==='clock.fs'){let clamped=false;cfg.eq.bands.forEach(b=>{if(b.freq>=value/2){b.freq=Math.floor(value*.45);clamped=true;}});if(clamped)toast('已将超出新采样率范围的 EQ 频率调低');renderBandCards();}
    if(path.startsWith('eq.')&&path!=='eq.enabled')preset='custom';
    changed();
  });
  function restoreInvalidNumber(event){const el=event.target;if(el.type==='number'&&el.dataset.bind&&(el.value===''||!el.validity.valid)){el.value=get(el.dataset.bind);toast('请输入字段范围内的有效数值');}}
  document.addEventListener('change',restoreInvalidNumber);
  document.addEventListener('focusout',restoreInvalidNumber);
  $('#applyModel').addEventListener('click',()=>{
    try{prepareAudition(true);syncControls();render();save();toast('浏览器试听已更新');}catch(e){toast(e.message);}
  });
  $('#resetConfig').addEventListener('click',()=>{cfg=defaults();preset='voice';selectedNode='pga';renderInspector();renderBandCards();if(!$('#settingsWindow').hidden)setView(currentView);changed();window.dispatchEvent(new CustomEvent('audiolab:configimport',{detail:{profile:cfg.profile}}));toast('已恢复默认草稿；检查所选模块后写入设备');});
  function download(name,data,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('#exportConfig').addEventListener('click',()=>{try{const config=validate(cfg);download('AC10x-Audio-Lab-config.json',JSON.stringify({format:'AC10x-configuration',schemaVersion:1,appVersion:AudioDebug.VERSION,referenceMclkHz:referenceMclkHz,config},null,2),'application/json');toast('已导出当前待应用配置');}catch(e){toast(e.message);}});
  $('#importConfig').addEventListener('click',()=>$('#configFile').click());
  let legacyRegisters=null,legacyReferenceRequest=0;
  $('#dismissImportMessage').addEventListener('click',()=>$('#importMessage').hidden=true);
  $('#importLegacyPreset').addEventListener('click',()=>$('#legacyPresetFile').click());
  $('#legacyPresetFile').addEventListener('change',async event=>{
    const f=event.target.files[0];if(!f)return;
    const request=++draftImportRequest,revision=draftRevision,navigation=viewRevision,current=()=>request===draftImportRequest&&revision===draftRevision;draftInputRequests.set(event.target,request);
    try{if(f.size>262144)throw Error('文件超过256KB');const text=await f.text();if(!current()){if(request===draftImportRequest)toast('草稿已改变，本次导入已取消');return;}const result=AudioLegacy.parsePreset(text,cfg),candidate=validate(result.config);cfg=clone(candidate);preset='custom';renderBandCards();renderInspector();changed();$('#importMessage').hidden=false;$('#legacyPresetInfo').textContent='已导入 '+(result.kind==='eq'?'EQ':'AGC')+' 草稿。'+result.notes.join(' ')+' 尚未写入设备。';$('#importMessageText').textContent=$('#legacyPresetInfo').textContent;if(navigation===viewRevision){if(result.kind==='agc')selectedNode='agc';setView(result.kind==='eq'?'eq':'dynamics');}toast('旧参数已载入草稿，尚未写入设备');}
    catch(e){if(current())toast('旧参数导入失败：'+e.message);}finally{if(draftInputRequests.get(event.target)===request)event.target.value='';}
  });
  function renderLegacyRegisters(){
    if(!legacyRegisters)return;const key=JSON.stringify([legacyRegisters,hardwareSnapshot,hardwareConnected]);if(key===legacyCompareKey)return;legacyCompareKey=key;
    const rows=AudioLegacy.compareRegisters(legacyRegisters,hardwareSnapshot),esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    $('#legacyRegisterRows').innerHTML=rows.map(r=>'<tr><td>'+hex(r.address)+'</td><td>'+hex(r.reference)+'</td><td>'+(r.current===null?'未读':hex(r.current))+'</td><td>'+hex(r.mask)+'</td><td>'+esc(r.address===0&&r.reference!==0x12?'复位命令，不能下发':!r.mask?'只读 / 电源 / 未支持':r.changed===null?'待设备读回':r.changed?'不同':'相同')+'</td></tr>').join('');
    $('#legacyRegisterInfo').textContent=rows.length+'项参考；'+rows.filter(r=>r.changed===true).length+'项与已有读回不同。'+(hardwareConnected?'当前设备快照。':'尚未连接或快照已过期。')+' 仅比较，不会自动写入或修改草稿。';
  }
  $('#legacyLoadRegisters').addEventListener('click',()=>$('#legacyRegisterFile').click());
  $('#legacyClearRegisters').addEventListener('click',()=>{legacyReferenceRequest++;legacyRegisters=null;legacyCompareKey='';$('#legacyRegisterRows').innerHTML='<tr><td colspan="5">尚未载入旧寄存器参考表。</td></tr>';$('#legacyRegisterInfo').textContent='参考表已清除。';});
  $('#legacyRegisterFile').addEventListener('change',async event=>{const f=event.target.files[0];if(!f)return;const request=++legacyReferenceRequest;draftInputRequests.set(event.target,request);try{if(f.size>262144)throw Error('文件超过256KB');const text=await f.text();if(request!==legacyReferenceRequest)return;const parsed=AudioLegacy.parseRegisterList(text);legacyRegisters=parsed;renderLegacyRegisters();toast('旧寄存器表仅用于比较');}catch(e){if(request===legacyReferenceRequest)toast('参考表导入失败：'+e.message);}finally{if(draftInputRequests.get(event.target)===request)event.target.value='';}});
  $('#exportMaskedRegisters').addEventListener('click',()=>{try{validate(cfg);const groups=$$('[data-export-group]:checked').map(el=>el.dataset.exportGroup),mclkHz=referenceMclkHz;if(!Number.isFinite(mclkHz)||mclkHz<=0)throw Error('MCLK参考值无效');download('AC10x-draft-masked-patches.h',AudioLegacy.exportMasked(cfg,{groups,mclkHz}),'text/plain');toast('已导出草稿掩码表；主控需实现静音、时序和核验');}catch(e){toast('寄存器导出失败：'+e.message);}});

  $('#configFile').addEventListener('change',async event=>{const f=event.target.files[0];if(!f)return;const request=++draftImportRequest,revision=draftRevision,current=()=>request===draftImportRequest&&revision===draftRevision;draftInputRequests.set(event.target,request);try{if(f.size>1024*1024)throw new Error('配置文件超过 1 MB');const text=await f.text();if(!current()){if(request===draftImportRequest)toast('草稿已改变，本次导入已取消');return;}const document=JSON.parse(text),next=validate(AudioDebug.parseConfig(document));if(document.referenceMclkHz!==undefined)setReferenceMclk(document.referenceMclkHz,false);cfg=clone(next);preset='custom';renderBandCards();renderInspector();changed();window.dispatchEvent(new CustomEvent('audiolab:configimport',{detail:{profile:cfg.profile}}));toast('草稿已导入；检查所选模块后写入设备');}catch(e){if(current())toast('导入失败：'+e.message);}finally{if(draftInputRequests.get(event.target)===request)event.target.value='';}});

  let routeRenderKey='',routeDiagramCache=null,legacyCompareKey='';
  // Complete, source-grounded routing diagram. Other tool pages retain their existing behavior.
  function renderRoute(){
    let graphConfig=cfg;const source=hardwareSnapshot?(hardwareConnected?'readback':'stale'):'draft';
    routeUI.hpfKnown=true;
    if(hardwareSnapshot){const decoded=C.decode(hardwareSnapshot,defaults(),{mclkHz:referenceMclkHz});graphConfig=decoded.config;routeUI.hpfKnown=decoded.known.hpfFrequency;}
    routeUI.readback=Boolean(hardwareSnapshot);routeUI.animate=hardwareConnected;routeUI.sourceLabel=source==='readback'?'设备读回路径':source==='stale'?'旧读回路径 · 已过期':'离线草稿路径';
    document.body.dataset.graphSource=source;routeUI.flowOffset=-(performance.now()%1400)/1000;routeUI.associate=!$('#settingsWindow').hidden&&currentView!=='route';const selected=routeUI.associate?selectedNode:null;
    const {raw,...graphState}=graphConfig;
    const nextKey=JSON.stringify([graphState,selected,source,routeUI.associate,routeUI.hpfKnown]),rebuild=nextKey!==routeRenderKey||!routeDiagramCache;
    if(rebuild){routeDiagramCache=R.render(graphConfig,selected,{...routeUI,zoom:1});routeRenderKey=nextKey;}
    const diagram=routeDiagramCache;
    if(rebuild){
      const nodeFocus=document.activeElement?.closest?.('#routeDiagram [data-node]')?.dataset.node;
      $('#routeDiagram').innerHTML=diagram.html;$('#routeDiagram').style.width=diagram.width+'px';$('#routeDiagram').style.height=diagram.height+'px';
      if(nodeFocus)$('#routeDiagram [data-node="'+nodeFocus+'"]')?.focus({preventScroll:true});
    }
    viewport.measure();viewport.content(diagram.width,diagram.height,routeUI.mode+':'+routeUI.focus);
    $('#routeCount').textContent=diagram.nodes+' 个节点 · '+diagram.count+' 条连接';
    $('#routeZoomValue').textContent=Math.round(routeUI.zoom*100)+'%';
    const monitorOn=R.graph(cfg).edges.find(e=>e.id==='rec-dacmix').on,monitorSelected=cfg.routing.dac.rec;
    const monitorStatus=$('#monitorRouteState');if(monitorStatus){monitorStatus.dataset.enabled=String(monitorOn);monitorStatus.textContent=!monitorSelected?'监听未启用：勾选下方开关，连线才会点亮。':monitorOn?'监听草稿已启用：RECD_DAT → DAC_MIX。':!cfg.adc.enabled?'监听已选择，但 ADC 数字通道关闭，请先启用 ADC。':'监听已选择，但当前 DMIC 采样率不可用，请检查输入与时钟设置。';}
    document.body.dataset.activeRoute='all';$('.canvas-heading h1').textContent='音频路径工作台';$('.canvas-heading .eyebrow').textContent=routeUI.sourceLabel;$('.canvas-heading p').textContent='一张完整图；点击模块编辑草稿，写入并核验后更新设备路径。';
  }
  function selectRouteNode(el){if(!el)return;selectedNode=el.dataset.node;const target={eq:'eq',agc:'dynamics',hpf:'dynamics',clock:'clock',decim:'clock',interp:'clock',control:'hardware'}[selectedNode]||'path';setView(target);}
  $('#routeDiagram').addEventListener('click',e=>{if(e.button===0)selectRouteNode(e.target.closest('[data-node]'));});
  $('#routeDiagram').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectRouteNode(e.target.closest('[data-node]'));}});
  function renderInspector(){const item=R.inspector(selectedNode,cfg);$('#nodeInspector').innerHTML=item.html;}
  $('#nodeInspector').addEventListener('click',e=>{const el=e.target.closest('[data-inspect-jump]');if(el)setView(el.dataset.inspectJump);});
  $('#routeZoomIn').addEventListener('click',()=>viewport.zoomBy(1.2));
  $('#routeZoomOut').addEventListener('click',()=>viewport.zoomBy(1/1.2));
  $('#routeFit').addEventListener('click',()=>viewport.fit());
  // SVG charts and parametric EQ.
  function chartBase(w,h,{minF=20,maxF=20000,minDb=-18,maxDb=18}={}){
    const left=44,right=w-20,top=18,bottom=h-27;
    const x=f=>left+Math.log(f/minF)/Math.log(maxF/minF)*(right-left),y=db=>bottom-(db-minDb)/(maxDb-minDb)*(bottom-top);
    let svg='';
    for(let db=Math.ceil(minDb/6)*6;db<=maxDb;db+=6)svg+='<line class="'+(db===0?'plot-zero':'plot-grid')+'" x1="'+left+'" y1="'+y(db)+'" x2="'+right+'" y2="'+y(db)+'"/><text class="plot-label" x="'+(left-9)+'" y="'+(y(db)+3)+'" text-anchor="end">'+(db>0?'+':'')+db+'</text>';
    (w<500?[20,100,1000,10000]:[20,50,100,200,500,1000,2000,5000,10000,20000]).filter(f=>f>=minF&&f<=maxF).forEach(f=>svg+='<line class="plot-grid" x1="'+x(f)+'" y1="'+top+'" x2="'+x(f)+'" y2="'+bottom+'"/><text class="plot-label" x="'+x(f)+'" y="'+(h-7)+'" text-anchor="middle">'+fmtHz(f)+'</text>');
    return {svg,x,y,left,right,top,bottom,minF,maxF,minDb,maxDb};
  }
  function curve(plot,fn,steps=360){let d='';for(let i=0;i<=steps;i++){const f=plot.minF*Math.pow(plot.maxF/plot.minF,i/steps),db=D.clamp(fn(f),plot.minDb,plot.maxDb);d+=(i?'L':'M')+plot.x(f).toFixed(2)+','+plot.y(db).toFixed(2);}return d;}
  function renderEQ(){
    const chartWidth=Math.max(300,Math.round(($('#eqChart').parentElement.clientWidth||382)-22));
    $('#eqChart').setAttribute('viewBox','0 0 '+chartWidth+' 220');
    const fs=cfg.clock.fs,maxF=Math.min(20000,fs/2-1),p=chartBase(chartWidth,220,{maxF});let svg=p.svg;
    cfg.eq.bands.forEach((b,i)=>{if(b.enabled&&cfg.eq.enabled)svg+='<path class="curve" stroke="'+colors[i]+'" opacity=".55" stroke-width="1.5" d="'+curve(p,f=>D.response(D.coefficients(b,fs),f,fs))+'"/>';});
    const total=curve(p,f=>D.cascadeDb(cfg.eq.bands,f,fs,cfg.eq.preGain,cfg.eq.enabled));
    svg+='<path d="'+total+'L'+p.right+','+p.y(-18)+'L'+p.left+','+p.y(-18)+'Z" fill="#087f83" opacity=".035"/><path class="curve" stroke="#234b52" stroke-width="2.6" d="'+total+'"/>';
    cfg.eq.bands.forEach((b,i)=>{const disabled=!b.enabled||!cfg.eq.enabled,y=['lowpass','highpass'].includes(b.type)?0:b.gain;
      svg+='<g role="slider" tabindex="0" aria-label="EQ 第'+(i+1)+'段频率与增益" aria-valuemin="20" aria-valuemax="'+Math.floor(maxF)+'" aria-valuenow="'+b.freq+'" aria-valuetext="'+b.freq+' Hz, '+b.gain+' dB" data-point="'+i+'"><circle class="eq-point" cx="'+p.x(b.freq)+'" cy="'+p.y(y)+'" r="8" fill="'+colors[i]+'" opacity="'+(disabled?.35:1)+'"/><text x="'+p.x(b.freq)+'" y="'+(p.y(y)-15)+'" text-anchor="middle" fill="'+colors[i]+'" font-size="10" font-family="Consolas">'+(i+1)+'</text></g>';});
    const deviceFs=hardwareSnapshot?C.inferFs(hardwareSnapshot,referenceMclkHz):null;if(hardwareSnapshot&&deviceFs===fs){const deviceCoefficients=C.decodeEq(hardwareSnapshot);if(deviceCoefficients){svg+='<path class="curve device-response" stroke="#6086a3" stroke-dasharray="5 5" d="'+curve(p,f=>(hardwareSnapshot[0x4f]&1)?deviceCoefficients.reduce((db,co)=>db+D.response(co,f,fs),0):0)+'"/>';}}$('#eqChart').innerHTML=svg;const sourceLabel=$('#deviceEQLabel');if(sourceLabel)sourceLabel.textContent=hardwareSnapshot?(deviceFs===fs?'蓝色虚线：设备读回系数 @ '+fs/1000+' kHz'+(hardwareConnected?'':'（连接或读回未确认，旧快照）'):deviceFs?'设备推导Fs '+deviceFs+' Hz与草稿不同，暂不叠加设备曲线':'设备Fs未确认，暂不叠加设备曲线'):'';
    let max=-100;for(let i=0;i<300;i++){const f=20*Math.pow(maxF/20,i/299);max=Math.max(max,D.cascadeDb(cfg.eq.bands,f,fs,cfg.eq.preGain,cfg.eq.enabled));}
    $('#headroomHint').textContent=max>0?'最大频率增益 '+signed(max)+' dB · 留意输入余量':'最大频率增益 '+signed(max)+' dB';
    const effective=C.eqCoefficients(cfg,{checkStability:false,checkRange:false});$('#coefficientRows').innerHTML=cfg.eq.bands.map((b,i)=>{const c=effective[i].values,q=effective[i].fixed.map(v=>v/65536),valid=effective[i].inRange&&D.stable(q);return '<tr><td style="color:'+colors[i]+'">BQ '+(i+1)+(b.enabled?'':' · BYPASS')+'</td>'+c.map(v=>'<td>'+v.toFixed(6)+'</td>').join('')+'<td class="'+(valid?'stable':'pending')+'">'+(!effective[i].inRange?'超出 3.16 范围':valid?'稳定':'需检查')+'</td></tr>';}).join('');
  }
  function renderBandCards(){
    const types=[['peaking','Peaking · 峰值'],['lowshelf','Low Shelf · 低架'],['highshelf','High Shelf · 高架'],['lowpass','Low Pass · 低通'],['highpass','High Pass · 高通']];
    $('#eqBands').innerHTML=cfg.eq.bands.map((b,i)=>{const p='eq.bands.'+i;return '<div class="eq-band" style="--band:'+colors[i]+'"><label class="switch-label band-enable"><input type="checkbox" aria-label="第'+(i+1)+'段EQ启用" data-bind="'+p+'.enabled">启用</label><details class="panel band-card" data-band-index="'+i+'" data-filter="'+b.type+'" '+(i===0?'open':'')+'><summary><span class="band-index">0'+(i+1)+'</span><span data-value="'+p+'.freq" data-unit="Hz"></span></summary><div class="band-fields"><select data-bind="'+p+'.type" aria-label="第'+(i+1)+'段滤波器类型">'+types.map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join('')+'</select>'+[['freq','频率 / Hz',20,Math.floor(Math.min(20000,cfg.clock.fs/2-1)),1],['gain','增益 / dB',-15,15,.5],['q','Q 值',.1,10,.001]].map(([key,label,min,max,step])=>'<div class="band-control" '+(key==='gain'?'data-gain-control':'')+'><div><label for="b'+i+key+'">'+label+'</label><input id="b'+i+key+'" aria-label="第'+(i+1)+'段'+label+'" data-bind="'+p+'.'+key+'" type="number" min="'+min+'" max="'+max+'" step="'+step+'"></div><input aria-label="第'+(i+1)+'段'+label+'滑块" data-bind="'+p+'.'+key+'" type="range" min="'+min+'" max="'+max+'" step="'+step+'"></div>').join('')+'</div></details></div>';}).join('');syncControls();
  }
  $('#eqPreset').addEventListener('change',e=>{const v=e.target.value;if(v==='custom')return;try{cfg.eq=E.eq(v,cfg.clock.fs);preset=v;renderBandCards();changed();}catch(error){toast(error.message);}});
  $('#eqChart').addEventListener('pointerdown',e=>{const point=e.target.closest('[data-point]');if(point&&e.button===0){dragging=Number(point.dataset.point);$$('[data-band-index]').forEach(el=>el.open=Number(el.dataset.bandIndex)===dragging);e.preventDefault();$('#eqChart').setPointerCapture(e.pointerId);}});
  $('#eqChart').addEventListener('pointermove',e=>{if(dragging<0)return;const svg=$('#eqChart'),rect=svg.getBoundingClientRect(),chartWidth=Number(svg.getAttribute('viewBox').split(/[ ,]+/)[2]),point=AudioViewport.svgPoint(rect,svg.getAttribute('viewBox'),e.clientX,e.clientY);if(!point)return;const {x,y}=point;const p=chartBase(chartWidth,220,{maxF:Math.min(20000,cfg.clock.fs/2-1)}),b=cfg.eq.bands[dragging];b.freq=Math.round(D.clamp(p.minF*Math.pow(p.maxF/p.minF,(x-p.left)/(p.right-p.left)),20,p.maxF));if(!['lowpass','highpass'].includes(b.type))b.gain=Math.round(D.clamp(p.maxDb-(y-p.top)/(p.bottom-p.top)*(p.maxDb-p.minDb),-15,15)*2)/2;preset='custom';changed();});
  $('#eqChart').addEventListener('pointerup',()=>dragging=-1);$('#eqChart').addEventListener('pointercancel',()=>dragging=-1);
  $('#eqChart').addEventListener('keydown',e=>{const el=e.target.closest('[data-point]');if(!el)return;const b=cfg.eq.bands[Number(el.dataset.point)];if(['ArrowLeft','ArrowRight'].includes(e.key))b.freq=Math.round(D.clamp(b.freq*(e.key==='ArrowRight'?1.05:1/1.05),20,Math.min(20000,cfg.clock.fs/2-1)));else if(['ArrowUp','ArrowDown'].includes(e.key)&&!['lowpass','highpass'].includes(b.type))b.gain=D.clamp(b.gain+(e.key==='ArrowUp'?.5:-.5),-15,15);else return;e.preventDefault();preset='custom';const i=el.dataset.point;changed();$('#eqChart [data-point="'+i+'"]').focus();});
  $('#exportCoefficients').addEventListener('click',()=>{try{const coeff=C.eqCoefficients(cfg,{checkStability:false});let text='/* AC10x EQ coefficients: signed 19-bit 3.16, trunc(value * 65536).\n * Registers: high byte bits 2:0, middle/low bytes 7:0.\n * Pre-gain is folded into BQ1 numerator; a0 = 1.\n * y = b0*x + b1*x1 + b2*x2 - a1*y1 - a2*y2.\n * Fs: '+cfg.clock.fs+' Hz. Validate stability before device use.\n */\n#include <stdint.h>\nstatic const int32_t ac10x_eq[3][5] = {\n';coeff.forEach((b,i)=>text+='    { '+b.fixed.join(', ')+' }, /* BQ'+(i+1)+' */\n');text+='};\n';download('AC10x-EQ-coefficients.h',text,'text/plain');toast('已导出硬件格式系数，第一段已包含前级增益');}catch(e){toast(e.message);}});


  function renderDynamics(){
    const w=520,h=300,left=47,right=490,top=18,bottom=265,x=v=>left+(v+90)/90*(right-left),y=v=>bottom-(v+90)/90*(bottom-top);let svg='';
    for(let v=-90;v<=0;v+=15)svg+='<line class="plot-grid" x1="'+x(v)+'" y1="'+top+'" x2="'+x(v)+'" y2="'+bottom+'"/><line class="plot-grid" x1="'+left+'" y1="'+y(v)+'" x2="'+right+'" y2="'+y(v)+'"/><text class="plot-label" x="'+x(v)+'" y="'+(bottom+18)+'" text-anchor="middle">'+v+'</text><text class="plot-label" x="'+(left-9)+'" y="'+(y(v)+3)+'" text-anchor="end">'+v+'</text>';
    svg+='<path d="M'+x(-90)+','+y(-90)+'L'+x(0)+','+y(0)+'" stroke="#c8d4d7" stroke-dasharray="4 4" fill="none"/>';
    let d='';for(let v=-90;v<=0;v++){const ag=cfg.agc,out=ag.enabled?(v<ag.threshold?v:Math.min(0,Math.min(v+ag.maxGain,ag.target))):v;d+=(v===-90?'M':'L')+x(v)+','+y(out);}svg+='<path class="curve" stroke="#0b8b88" d="'+d+'"/><text class="plot-label" x="'+right+'" y="'+(h-1)+'" text-anchor="end">INPUT / dBFS</text><text class="plot-label" x="'+left+'" y="10">OUTPUT / dBFS</text>';
    $('#agcChart').innerHTML=svg;
    const p=chartBase(600,210,{minDb:-48,maxDb:6,maxF:Math.min(20000,cfg.clock.fs/2-1)}),coef=C.hpf(cfg.hpf.freq,cfg.clock.fs).coefficients;$('#hpfChart').innerHTML=p.svg+'<path class="curve" stroke="#0b8b88" d="'+curve(p,f=>cfg.hpf.enabled?D.response(coef,f,cfg.clock.fs):0)+'"/>';
  }
  function renderClock(){
    const c=cfg.clock,bclk=c.fs*c.slot*c.slots,mclk=referenceMclkHz;
    $('#clockMetrics').innerHTML=[['LRCK · 采样率',c.fs/1000,'kHz'],['BCLK · 位时钟',bclk/1e6,'MHz'],['MCLK · 填入的板端参考',mclk/1e6,'MHz']].map(([name,v,u])=>'<div class="clock-metric"><span>'+name+'</span><b>'+Number(v.toFixed(6))+'<small>'+u+'</small></b></div>').join('');
    $('#clockValidation').textContent='帧宽 '+c.slot*c.slots+' bit · 每时隙 '+c.bits+' bit 有效数据，'+(c.slot-c.bits)+' bit 填充。'+(c.role==='slave'?'从机模式需外部提供 BCLK / LRCK。':'主机模式需核验实际时钟分频。');
    $('#frameTag').textContent=c.format+' / '+c.bits+' IN '+c.slot+' BITS';
    const left=100,right=1020,span=right-left,unit=span/(c.slot*c.slots),slot=span/c.slots;let s='';
    ['LRCK','BCLK','DATA'].forEach((name,i)=>s+='<text class="plot-label" x="20" y="'+(43+i*63)+'">'+name+'</text>');
    if(c.format==='PCM'){s+='<path class="curve" stroke="#8fb6ba" d="M'+left+',47V25H'+(left+unit)+'V47H'+right+'"/>';}else s+='<path class="curve" stroke="#8fb6ba" d="M'+left+',47H'+(left+slot)+'V25H'+right+'"/>';
    let path='M'+left+',110';for(let i=0;i<c.slot*c.slots;i++)path+='h'+unit/2+'v-18h'+unit/2+'v18';s+='<path fill="none" stroke="#6b9a9f" stroke-width="1.2" d="'+path+'"/>';
    const offset=c.format==='I2S'?1:0;
    for(let i=0;i<c.slots;i++){const start=left+i*slot+(c.format==='RJ'?(c.slot-c.bits):offset)*unit,dataEnd=Math.min(left+(i+1)*slot,start+c.bits*unit);s+='<rect x="'+start+'" y="145" width="'+Math.max(0,dataEnd-start)+'" height="29" rx="3" fill="'+(i?'#e9e8f5':'#dff0ec')+'"/><text x="'+((start+dataEnd)/2)+'" y="164" text-anchor="middle" font-size="10" fill="'+(i?'#7773b0':'#398b83')+'" font-family="Consolas">SLOT '+(i+1)+' · '+c.bits+' bit</text>';for(let k=0;k<c.bits;k++)s+='<line x1="'+(start+k*unit)+'" x2="'+(start+k*unit)+'" y1="148" y2="171" stroke="white" opacity=".4"/>';}
    s+='<text class="plot-label" x="'+right+'" y="207" text-anchor="end">'+(c.format==='I2S'?'I²S 数据延迟 1 BCLK；跨帧末位省略显示':c.format==='RJ'?'有效数据右对齐至时隙末尾':'按时隙展示的概念帧')+'</text>';$('#frameChart').innerHTML=s;
  }

  // Register facts from the AC102 vendor header. No undocumented encodings are inferred.
  const registerDefs=[[0,'CHIP_AUDIO_RST'],[1,'PWR_CTRL1'],[2,'PWR_CTRL2'],[3,'SYS_FUNC_CTRL'],[4,'ADC_CLK_SET'],[5,'DAC_CLK_SET'],[6,'SYS_CLK_ENA'],[7,'I2S_CTRL'],[8,'I2S_BCLK_CTRL'],[9,'I2S_LRCK_CTRL1'],[10,'I2S_LRCK_CTRL2'],[11,'I2S_FMT_CTRL1'],[12,'I2S_FMT_CTRL2'],[13,'I2S_FMT_CTRL3'],[14,'I2S_SLOT_CTRL'],[15,'I2S_TX_CTRL'],[17,'I2S_TX_CHMP_CTRL'],[19,'I2S_TX_MIX_SRC'],[22,'I2S_RX_CHMP_CTRL'],[24,'I2S_RX_MIX_SRC'],[25,'ADC_DIG_CTRL'],[26,'ADC_DVC'],[27,'DAC_DIG_CTRL'],[28,'DAC_DVC'],[29,'DAC_MIX_SRC'],[31,'DIG_PADDRV_CTRL']];
  for(let i=0;i<5;i++)registerDefs.push([0x20+i,'ADC_ANA_CTRL'+(i+1)]);for(let i=0;i<4;i++)registerDefs.push([0x25+i,'DAC_ANA_CTRL'+(i+1)]);
  ['AGC_STA','AGC_CTRL','AGC_DEBT','AGC_TGLVL','AGC_MAXG','AGC_AVGC1','AGC_AVGC2','AGC_AVGC3','AGC_AVGC4','AGC_DECAYT1','AGC_DECAYT2','AGC_ATTACKT1','AGC_ATTACKT2','AGC_NTH','AGC_NAVGC1','AGC_NAVGC2','AGC_NAVGC3','AGC_NAVGC4','HPF_COEF1','HPF_COEF2','HPF_COEF3','HPF_COEF4','AGC_OPT'].forEach((s,i)=>registerDefs.push([0x30+i,s]));registerDefs.push([0x4f,'EQ_CTRL']);
  for(let b=0;b<3;b++)['B0','B1','B2','A1','A2'].forEach((name,i)=>['H','M','L'].forEach((part,j)=>registerDefs.push([0x50+b*16+i*3+j,'EQ'+(b+1)+'_'+name+'_'+part])));
  $('#registerSearch').addEventListener('input',()=>renderRegisters());
  function renderRegisters(){
    const focusedAddress=document.activeElement?.closest?.('#registerRows [data-register-select]')?.dataset.registerSelect;
    const query=$('#registerSearch').value.trim().toLowerCase(),rows=registerDefs.filter(([a,name])=>!query||name.toLowerCase().includes(query)||hex(a).toLowerCase().includes(query));
    $('#registerRows').innerHTML=rows.map(([a,name])=>'<tr data-address="'+a+'" class="'+(selectedReg===a?'selected':'')+'"><td><button type="button" class="register-select" data-register-select="'+a+'" aria-label="'+hex(a)+' '+name+'" aria-pressed="'+(selectedReg===a)+'">'+hex(a)+'</button></td><td>'+name+'</td><td class="'+(hardwareConnected?'device-register':'stale-register')+'">'+(hardwareSnapshot&&Number.isInteger(hardwareSnapshot[a])?hex(hardwareSnapshot[a])+(hardwareConnected?'':' · 旧'):'—')+'</td></tr>').join('');
    $('#registerCount').textContent=rows.length+' / '+registerDefs.length;
    if(!['hwRegAddress','hwRegValue'].includes(document.activeElement?.id)){
      $('#hwRegAddress').value=hex(selectedReg);$('#hwRegValue').value=hex(hardwareSnapshot?.[selectedReg]??0);
      $('#selectedRegisterName').textContent=hex(selectedReg)+' · '+(registerDefs.find(([a])=>a===selectedReg)?.[1]||'寄存器');
    }
    if(focusedAddress!==undefined)$('#registerRows [data-register-select="'+focusedAddress+'"]')?.focus({preventScroll:true});
  }
  function selectRegister(el){if(!el)return;selectedReg=Number(el.dataset.address);renderRegisters();window.dispatchEvent(new Event('audiolab:registerselect'));}
  $('#registerRows').addEventListener('click',e=>selectRegister(e.target.closest('[data-address]')));
  $('#registerRows').addEventListener('keydown',e=>{if(e.target.closest('[data-register-select]'))return;if(e.key==='Enter')selectRegister(e.target.closest('[data-address]'));});

  // Real local audio. No microphone permission or device activity is requested.
  function generateSignal(notify=true){
    stopAudio();const fs=applied.clock.fs,type=$('#signalType').value,f=D.clamp(Number($('#signalFrequency').value)||1000,20,Math.min(20000,fs/2-1)),level=D.clamp(Number($('#signalLevel').value)||-18,-60,-6),duration=D.clamp(Number($('#signalDuration').value)||3,1,10),n=Math.round(fs*duration),a=Math.pow(10,level/20),data=new Float32Array(n);
    $('#signalFrequency').value=f;$('#signalLevel').value=level;$('#signalDuration').value=duration;
    for(let i=0;i<n;i++){const t=i/fs;if(type==='sweep'){const lo=20,hi=Math.min(20000,fs*.45),k=Math.log(hi/lo)/duration;data[i]=a*Math.sin(2*Math.PI*lo*(Math.exp(k*t)-1)/k);}else if(type==='multitone'){const freqs=[250,1000,4000].filter(v=>v<fs/2);data[i]=a*freqs.reduce((s,v)=>s+Math.sin(2*Math.PI*v*t),0)/freqs.length;}else data[i]=a*Math.sin(2*Math.PI*f*t);}
    audioChannels=[data];audioFs=fs;importedName='';audioOrigin='generated';wetCache=null;$('#audioSourceName').textContent='内置测试信号 · '+{sine:'正弦波',sweep:'对数扫频',multitone:'多音'}[type];renderAudio();if(notify)toast('测试信号已生成，点击播放试听');
  }
  function processedAudio(){if(!wetCache){const bands=applied.eq.bands.map(b=>({...b,freq:Math.min(b.freq,audioFs/2-1)}));wetCache=audioChannels.map(ch=>D.processSamples(ch,bands,audioFs,applied.eq.preGain,applied.eq.enabled));}return wetCache;}
  function activeAudio(){return audioWet?processedAudio():audioChannels;}
  function renderAudio(){
    if(!audioChannels.length)return;const data=activeAudio()[0],s=D.stats(data);$('#audioFsTag').textContent=Number((audioFs/1000).toFixed(3))+' kHz';$('#audioLength').textContent=(data.length/audioFs).toFixed(2)+' s · '+(audioChannels.length===1?'MONO':'STEREO');$('#audioDry').classList.toggle('active',!audioWet);$('#audioWet').classList.toggle('active',audioWet);$('#audioDry').setAttribute('aria-pressed',String(!audioWet));$('#audioWet').setAttribute('aria-pressed',String(audioWet));
    $('#audioStats').innerHTML='<span>PEAK <b>'+s.peakDb.toFixed(1)+' dBFS</b></span><span>RMS <b>'+s.rmsDb.toFixed(1)+' dBFS</b></span>'+(s.clipped?'<span class="warning">'+s.clipped+' 点超出 0 dBFS</span>':'');
    const dirty=!R.equivalent(cfg.eq,applied.eq);$('#audioModelNote').textContent=(dirty?'有未应用的 EQ 修改，当前试听使用上一次已应用配置。':'已应用 EQ · '+(applied.eq.enabled?'启用':'旁路')+' · 前级 '+signed(applied.eq.preGain)+' dB。')+(audioFs!==applied.clock.fs?' 按音频源采样率计算响应。':'');
    $('#plotSource').textContent=({generated:'生成信号',imported:'导入音频',recording:'声卡录音'}[audioOrigin])+' · '+(audioWet?'EQ 后':'原始信号')+' · 第 1 通道计算结果';
    const w=520,h=200,l=44,r=503,t=18,b=169;let svg='';[-1,-.5,0,.5,1].forEach(v=>{const y=t+(1-v)/2*(b-t);svg+='<line class="plot-grid" x1="'+l+'" y1="'+y+'" x2="'+r+'" y2="'+y+'"/><text class="plot-label" x="'+(l-8)+'" y="'+(y+3)+'" text-anchor="end">'+v+'</text>';});
    let d='';const count=Math.min(Math.round(audioFs*.02),data.length);for(let i=0;i<count;i++)d+=(i?'L':'M')+(l+i/Math.max(1,count-1)*(r-l)).toFixed(2)+','+(t+(1-D.clamp(data[i],-1,1))/2*(b-t)).toFixed(2);svg+='<path class="curve" stroke="#168b88" stroke-width="1.3" d="'+d+'"/><text class="plot-label" x="'+l+'" y="190">0 ms</text><text class="plot-label" x="'+r+'" y="190" text-anchor="end">20 ms</text>';$('#waveChart').innerHTML=svg;
    const fft=D.fftDb(data),p=chartBase(w,h,{minDb:-96,maxDb:0,maxF:Math.min(20000,audioFs/2-1)});let fd='';for(let i=1;i<fft.length;i++){const f=i*audioFs/2048;if(f<20||f>p.maxF)continue;fd+=(fd?'L':'M')+p.x(f).toFixed(2)+','+p.y(D.clamp(fft[i],-96,0)).toFixed(2);}$('#spectrumChart').innerHTML=p.svg+'<path class="curve" stroke="#168b88" stroke-width="1.4" d="'+fd+'"/>';
  }
  function stopAudio(){audioEpoch++;if(playback){try{playback.stop();playback.disconnect();}catch{}playback=null;}if(monitorGain){monitorGain.disconnect();monitorGain=null;}$('#playStatus').textContent='准备就绪';$('#playAudio').textContent='▶';}
  async function ensureAudioContext(){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw new Error('当前浏览器不支持 Web Audio');if(!audioContext)audioContext=new C();if(audioContext.state==='suspended')await audioContext.resume();return audioContext;}
  $('#generateAudio').addEventListener('click',()=>generateSignal());$('#returnSignal').addEventListener('click',()=>generateSignal());
  $('#audioDry').addEventListener('click',()=>{stopAudio();audioWet=false;renderAudio();});$('#audioWet').addEventListener('click',()=>{stopAudio();audioWet=true;renderAudio();});
  $('#playAudio').addEventListener('click',async()=>{if(playback){stopAudio();return;}const token=++audioEpoch;try{const ctx=await ensureAudioContext();if(token!==audioEpoch)return;const channels=activeAudio(),buffer=ctx.createBuffer(channels.length,channels[0].length,audioFs);channels.forEach((ch,i)=>buffer.copyToChannel(ch,i));const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;source.connect(gain);gain.connect(ctx.destination);const now=ctx.currentTime,end=now+buffer.duration,target=Math.pow(10,Number($('#monitorVolume').value)/20);gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(target,now+.02);gain.gain.setValueAtTime(target,Math.max(now+.02,end-.03));gain.gain.linearRampToValueAtTime(0,end);source.onended=()=>{if(playback===source){playback=null;monitorGain=null;source.disconnect();gain.disconnect();$('#playStatus').textContent='播放结束';$('#playAudio').textContent='▶';}};playback=source;monitorGain=gain;source.start();$('#playStatus').textContent=audioWet?'播放 B · EQ 后':'播放 A · 原始信号';$('#playAudio').textContent='■';}catch(e){if(token===audioEpoch){stopAudio();toast('播放失败：'+e.message);}}});
  $('#stopAudio').addEventListener('click',stopAudio);
  $('#monitorVolume').addEventListener('input',e=>{$('#monitorValue').textContent=e.target.value+' dB';if(monitorGain&&audioContext){const now=audioContext.currentTime;monitorGain.gain.cancelScheduledValues(now);monitorGain.gain.setTargetAtTime(Math.pow(10,Number(e.target.value)/20),now,.02);}});
  $('#chooseAudio').addEventListener('click',()=>$('#audioFile').click());
  $('#audioFile').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;stopAudio();const token=audioEpoch;try{if(file.size>64*1024*1024)throw new Error('请选小于 64 MB 的音频');const ctx=await ensureAudioContext();if(token!==audioEpoch)return;const buffer=await ctx.decodeAudioData(await file.arrayBuffer());if(token!==audioEpoch)return;audioFs=buffer.sampleRate;const n=Math.min(buffer.length,audioFs*30);audioChannels=Array.from({length:Math.min(buffer.numberOfChannels,2)},(_,i)=>buffer.getChannelData(i).slice(0,n));importedName=file.name;audioOrigin='imported';const fileLabel=document.createElement('span');fileLabel.dataset.noI18n='';fileLabel.textContent=file.name;$('#audioSourceName').replaceChildren(fileLabel,document.createTextNode(buffer.duration>30?' · 前 30 秒':''));wetCache=null;renderAudio();toast('音频已载入本地，未上传');}catch(e){if(token===audioEpoch)toast('无法载入音频：'+e.message);}finally{if(token===audioEpoch)event.target.value='';}});
  $('#exportWav').addEventListener('click',()=>{const channels=activeAudio();download((audioOrigin==='recording'?'Audio-Lab-Recording-'+(audioWet?'EQ':'Raw'):'Audio-Lab-'+(audioWet?'EQ':'Dry'))+'.wav',D.wav(channels,audioFs),'audio/wav');toast('已导出 16 bit PCM WAV；超出满幅的采样会限幅');});

  // Hardware UI owns its explicit connection and write actions; local playback stays separate.
  window.addEventListener('pagehide',()=>{stopAudio();if(audioContext)audioContext.close().catch(()=>{});});

  const capture=new AudioCapture.Recorder({
    onState(state){const idle=state==='idle';$('#captureList').disabled=!idle;$('#captureDevice').disabled=!idle;$('#captureSeconds').disabled=!idle;$('#captureStart').disabled=!idle||!$('#captureDevice').value;$('#captureStop').disabled=!['starting','recording','listing'].includes(state);if(!idle)$('#captureStatus').textContent={listing:'等待录音权限并读取设备列表…',starting:'正在打开所选声卡…',recording:'录音中，不监听输入；到时自动停止。'}[state]||state;},
    onDone(result){stopAudio();audioChannels=result.channels;audioFs=result.sampleRate;importedName='声卡录音';audioOrigin='recording';audioWet=false;wetCache=null;$('#audioSourceName').textContent='本地声卡录音 · '+result.seconds.toFixed(3)+' s';const settings=result.settings,flags=['echoCancellation','noiseSuppression','autoGainControl'].map(k=>k+'='+String(settings[k]??'未报告')).join('，');$('#captureStatus').textContent=result.engine+'；浏览器PCM '+result.sampleRate+' Hz / '+result.channels.length+'通道。'+flags+'。可能经过系统混音或重采样，不能据此声称器件本体THD/SNR。';renderAudio();toast('录音已载入，已选择原始信号；可切换B试听，导出当前A/B');},
    onError(e){$('#captureStatus').textContent=e.message;toast('录音停止：'+e.message);}
  });
  $('#captureDevice').addEventListener('change',()=>$('#captureStart').disabled=capture.state!=='idle'||!$('#captureDevice').value);
  $('#captureList').addEventListener('click',async()=>{try{const devices=await capture.list();if(capture.closed||devices===null)return;$('#captureDevice').replaceChildren(new Option('请选择实际USB声卡输入',''),...devices.map(d=>new Option(d.label,d.id)));$('#captureStart').disabled=true;$('#captureStatus').textContent=devices.length?'已列出输入，请选择实际USB声卡。HID设备名称不代表录音输入已选择。':'未找到可选择的录音输入。';}catch(e){$('#captureStatus').textContent='无法列出输入：'+e.message;}});
  $('#captureStart').addEventListener('click',async()=>{try{stopAudio();await capture.start($('#captureDevice').value,Number($('#captureSeconds').value));}catch(e){$('#captureStatus').textContent='录音失败：'+e.message;toast(e.message);}});
  $('#captureStop').addEventListener('click',()=>{const recording=capture.state==='recording';capture.stop(true);if(!recording)$('#captureStatus').textContent='录音已取消。';});
  window.addEventListener('pagehide',()=>capture.close(),{once:true});
  window.AudioLab={
    getDraftRevision:()=>draftRevision,getConfig:()=>clone(cfg),getAuditionConfig:()=>clone(applied),getDefaultConfig:()=>defaults(),getContext:()=>({view:currentView,node:selectedNode}),selectRegisterAddress(a){selectedReg=a;if(currentView==='registers')renderRegisters();},getDefinitions:()=>clone(registerDefs),navigate:setView,toast,openNode:id=>selectRouteNode({dataset:{node:id}}),openOverview(){closeSettings();},setReferenceMclk,getReferenceMclk:()=>referenceMclkHz,prepareAudition,
    setTargetProfile(profile){if(!['AC101S','AC102'].includes(profile))throw Error('不支持的寄存器表');cfg.profile=profile;changed();},
    validateConfig:c=>validate(clone(c)),
    setHardwareSnapshot(snapshot,connected){hardwareSnapshot=snapshot?{...snapshot}:null;hardwareConnected=connected;render();},
    importHardwareConfig(next,options={}){const candidate=clone(next);candidate.eq.bands.forEach(b=>b.freq=Math.min(b.freq,candidate.clock.fs*.45));cfg=validate(candidate);preset='custom';if(options.presetId&&E.eqPresets.some(p=>p.id===options.presetId)&&JSON.stringify({...E.eq(options.presetId,cfg.clock.fs),enabled:cfg.eq.enabled})===JSON.stringify(cfg.eq))preset=options.presetId;renderBandCards();renderInspector();changed();window.dispatchEvent(new CustomEvent('audiolab:configimport',{detail:{profile:cfg.profile}}));},
    getHardwareSnapshot:()=>hardwareSnapshot?{...hardwareSnapshot}:null,getViewport:()=>viewport.camera.snapshot()
  };
  function render(){syncControls();renderLegacyRegisters();renderRoute();if(currentView==='eq')renderEQ();else if(currentView==='dynamics')renderDynamics();else if(currentView==='clock')renderClock();else if(currentView==='registers')renderRegisters();else if(currentView==='audio')renderAudio();}
  window.addEventListener('resize',()=>{renderRoute();if(currentView==='eq')renderEQ();});
  $('#eqPreset').innerHTML=[...new Set(E.eqPresets.map(p=>p.group))].map(group=>'<optgroup label="'+group+'">'+E.eqPresets.filter(p=>p.group===group).map(p=>'<option value="'+p.id+'">'+p.name+'</option>').join('')+'</optgroup>').join('')+'<option value="custom">自定义</option>';
  const eqNote=document.createElement('p');eqNote.id='eqPresetNote';eqNote.className='inset-note eq-preset-note';$('#eqChart').parentElement.before(eqNote);
  renderInspector();renderBandCards();generateSignal(false);render();
  const initial=location.hash.slice(1);if(names[initial]&&initial!=='path')setView(initial);else closeSettings();
})();



