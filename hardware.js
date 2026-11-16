/* One workbench, one explicit write action, current-module masks, actual readback. */
(() => {
  'use strict';
  const A=window.AudioLab,T=AudioHardwareTransport,C=AudioCodec,S=AudioHardwareSession,D=AudioDebug,$=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
  const hex=n=>'0x'+Number(n).toString(16).toUpperCase().padStart(2,'0'),escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let failure='',bridge=null,session=null,busy=false,activeRun=null,logs=[],generation=0,lastMessage='未连接设备',lastDetail='请使用右上角连接 USB。';
  let baseline=null,baselineRequest=0,baselineSelection=0,bridgeStatus=null,diagnostics=[],droppedEvents=0,logPaint=null;
  let quickState={phase:"idle",message:""};
  let monitoring=false,monitorTimer=null,monitorFlight=null,monitorDeadline=0,monitorSamples=[],monitorList=[];
  const available=()=>Boolean(bridge?.connected&&!bridge.fault),fresh=()=>Boolean(available()&&session?.snapshot&&!session.stale&&session.snapshot[0]===0x12);
  function options(){const {view,node}=A.getContext();let groups,scope=null,label;
    if(view==='hardware'){groups=$$('[data-hw-group]:checked').map(e=>e.dataset.hwGroup);label='所选参数';}
    else if(view==='eq'){groups=['eq'];label='EQ';}
    else if(view==='dynamics'){groups=['dynamics'];scope=node==='hpf'?'hpf':'agc';label=scope==='hpf'?'HPF':'AGC';}
    else if(view==='clock'){groups=['clock'];label='时钟与接口';}
    else {groups=['routing'];scope=node;label=AudioI18n.sourceText($('#inspectorTitle')).split(' · ')[0]||'当前模块';}
    return{groups,scope,label,mclkHz:A.getReferenceMclk(),profile:$('#hwProfile').value};
  }
  function log(e){logs.push(e);if(logs.length>5000){logs.shift();droppedEvents++;}if(logPaint===null)logPaint=setTimeout(()=>{logPaint=null;renderLogs();},80);}
  function renderLogs(){$('#hwLogRows').innerHTML=logs.length?logs.slice(-20).reverse().map(e=>'<tr><td>'+escape(e.time.slice(11,23))+'</td><td>'+e.direction+'</td><td>'+({0:'WRITE',1:'READ',2:'MCLK',126:'STATUS'}[e.command]||e.command)+'</td><td>'+(Number.isInteger(e.address)?hex(e.address):'—')+'</td><td>'+e.payload.slice(0,16).map(v=>v.toString(16).padStart(2,'0').toUpperCase()).join(' ')+'</td></tr>').join(''):'<tr><td colspan="5">尚无通信。</td></tr>';}
  function setStatus(message,detail=''){lastMessage=message;lastDetail=detail;$('#hwStatus').textContent=message;$('#hwStatusDetail').textContent=detail;renderOperation();window.dispatchEvent(new Event('audiolab:hardwarestate'));}
  function updateSnapshot(){A.setHardwareSnapshot(session?.snapshot||null,fresh());}
  function progress(e){$('#hwProgress').max=Math.max(1,e.total);$('#hwProgress').value=e.completed;$('#hwProgressLabel').textContent=({read:'读回',plan:'差异',write:'写入并核验'}[e.phase]||e.phase)+' '+e.completed+' / '+e.total+(e.address!==undefined?' · '+hex(e.address):'');renderOperation();}
  function renderOperation(){
    const focusedCancel=['hwCancel','quickStartCancel'].includes(document.activeElement?.id);
    $('#quickStart').disabled=busy;
    $('#quickStart').textContent=quickState.phase==='applying'?'正在写入快捷方案…':'Quick Start';
    $('#quickStartCancel').hidden=!activeRun;$('#quickStartCancel').disabled=!activeRun||activeRun.cancelled;
    $('#quickStartCancel').textContent=activeRun?.cancelled?'正在取消…':'取消操作';
    $('#quickStartStatus').textContent=busy?lastMessage+' · '+$('#hwProgressLabel').textContent:failure||quickState.message||(fresh()?'Quick Start：默认声卡、播放、录音和数字排查；选择方案后明确写入并核验。':'可先打开 Quick Start 浏览方案；连接 USB 并完整读回后可写入。');
    $('#quickStartReady').textContent=fresh()?'设备已就绪；点击任一方案的“写入并核验”。':'可先浏览方案；连接 USB 并完整读回后可写入。';
    $('#quickStartConnect').hidden=fresh();$('#quickStartConnect').disabled=busy;
    for(const button of $$('[data-quick-apply]'))button.disabled=busy||!fresh();
    if(!$('#quickStartPicker').hidden&&document.activeElement?.matches('[data-quick-apply]:disabled'))$('#closeQuickStart').focus();
    if(!activeRun&&focusedCancel){const target=$('#settingsWindow').hidden?$('#canvasScroll'):$('#inspectorTitle');target.tabIndex=-1;target.focus({preventScroll:true});}
  }
  function assertAdapterFormat(config,opt){C.assertAdapterClock(config,opt,bridge?.device);}
  function stopMonitor(reason='监视已停止'){monitoring=false;if(monitorTimer!==null)clearTimeout(monitorTimer);monitorTimer=null;$('#hwMonitorInfo').textContent=reason;}
  function scheduleMonitor(delay){if(monitoring&&monitorTimer===null)monitorTimer=setTimeout(monitorTick,delay);}
  async function monitorTick(){
    monitorTimer=null;if(!monitoring)return;
    if(Date.now()>=monitorDeadline){stopMonitor('已达到30分钟上限，监视已停止');render();return;}
    if(busy||session?.busy){scheduleMonitor(250);return;}
    if(!available()){stopMonitor('设备不可用，监视已停止');render();return;}
    const token=generation;
    monitorFlight=(async()=>{
      for(const address of monitorList){
        if(!monitoring||busy||token!==generation)break;
        const value=await session.readOne(address);
        if(token!==generation)break;
        monitorSamples.push({time:new Date().toISOString(),address,value});if(monitorSamples.length>600)monitorSamples.shift();
      }
    })();
    try{await monitorFlight;updateSnapshot();}
    catch(e){failure=describeError(e);stopMonitor('读回失败，监视已停止：'+failure);}
    finally{monitorFlight=null;render();scheduleMonitor(Number($('#hwMonitorInterval').value));}
  }
  function baselineMessage(prefix,suffix){const label=document.createElement('span');label.textContent=baseline.label;if(!baseline.readAt)label.dataset.noI18n='';$('#hwBaselineInfo').replaceChildren(document.createTextNode(prefix),label,document.createTextNode(suffix));}
  function renderDebug(){
    const adapter=D.adapterInfo(bridge?.device),ready=fresh();
    diagnostics=D.diagnose(session?.snapshot,{stale:!ready||busy,adapter,mclkHz:A.getReferenceMclk(),status:bridgeStatus,profile:$('#hwProfile').value});
    const names={ok:'正常',warning:'需检查',error:'不匹配',info:'状态',unknown:'待确认'};
    $('#hwDiagnosticRows').innerHTML=diagnostics.map(x=>'<tr><td>'+escape(x.title)+'</td><td>'+names[x.severity]+'</td><td>'+escape(x.detail)+'</td></tr>').join('');
    $('#hwQueryBridge').disabled=busy||!available()||!adapter?.statusQuery;$('#hwMuteDAC').disabled=busy||!available();
    $('#hwSaveBaseline').disabled=busy||!ready;$('#hwLoadBaseline').disabled=busy;
    $('#hwRestoreLast').disabled=busy||!ready||!session?.lastTransaction;
    if(bridgeStatus)$('#hwBridgeStatus').textContent='查询于 '+new Date(bridgeStatus.readAt).toLocaleTimeString()+' · 协议 '+bridgeStatus.protocolVersion+' · 时钟'+(bridgeStatus.clockGate?'开':'关')+' · 播放'+(bridgeStatus.playbackActive?'活动':'空闲')+' · 录音'+(bridgeStatus.captureActive?'活动':'空闲')+' · I²C计数 '+bridgeStatus.i2cErrorsLow8;
    else $('#hwBridgeStatus').textContent=adapter?.kind==='TI'?'TI 适配器未提供桥接状态接口。':'桥接状态尚未查询；查询值不代表时钟频率的实测。';
    const last=session?.lastTransaction;
    $('#hwUndoInfo').textContent=last?'上次已核验写入：'+new Date(last.completedAt).toLocaleTimeString()+' · '+last.fields.length+'个地址；仅恢复其拥有的位。':'本次连接尚无可恢复的已核验写入。';
    if(baseline&&session?.snapshot){
      const diff=D.diffSnapshots(baseline.snapshot,session.snapshot);
      baselineMessage('基线：',' · '+diff.length+'个地址变化'+(ready?'':' · 当前为缓存快照')+'；比较不会下发设备。');
      $('#hwBaselineRows').innerHTML=diff.length?diff.map(p=>'<tr><td>'+hex(p.address)+'</td><td>'+(p.before===null?'缺失':hex(p.before))+'</td><td>'+(p.after===null?'缺失':hex(p.after))+'</td><td>'+(p.changedMask===null?'—':hex(p.changedMask))+'</td></tr>').join(''):'<tr><td colspan="4">两份快照一致。</td></tr>';
    }else if(baseline){baselineMessage('已导入基线：','；连接并读回后比较。');$('#hwBaselineRows').innerHTML='<tr><td colspan="4">等待当前设备读回。</td></tr>';}
    $('#hwMonitorToggle').disabled=!monitoring&&(busy||!available());$('#hwMonitorToggle').textContent=monitoring?'停止监视':'开始监视';
    $('#hwMonitorAddresses').disabled=monitoring||busy;$('#hwMonitorInterval').disabled=monitoring||busy;$('#hwMonitorExport').disabled=!monitorSamples.length;
    $('#hwMonitorRows').innerHTML=monitorSamples.slice(-16).reverse().map(x=>'<tr><td>'+escape(x.time.slice(11,23))+'</td><td>'+hex(x.address)+'</td><td>'+hex(x.value)+'</td></tr>').join('');
  }
  function planFor(opt){assertAdapterFormat(A.getConfig(),opt);if(!opt.groups.length)throw new Error('至少选择一组参数');A.validateConfig(A.getConfig());const plan=C.makePlan(A.getConfig(),session.snapshot,opt);if(!opt.groups.includes('clock')&&opt.groups.some(g=>g==='eq'||g==='dynamics')){const fs=C.inferFs(session.snapshot,opt.mclkHz);if(fs!==A.getConfig().clock.fs)throw new Error('设备推导 Fs '+(fs||'未知')+' 与草稿不同，请先导入设备标量或设置时钟');}return plan;}
  function render(){const live=available(),ready=fresh(),ctx=A.getContext(),inspectOnly=$('#settingsWindow').hidden||['audio','registers','route'].includes(ctx.view),opt=options();document.body.dataset.hardware=ready?'ready':bridge?.fault?'fault':live?'connected':'offline';
    $('#connectionLabel').textContent=ready?(T.adapterProfile(bridge.device)?.fixedAudio?T.adapterProfile(bridge.device).kind+' · ':'')+'ID 0x12 · I²C '+hex(bridge.i2cAddress):bridge?.fault?'通信待恢复':live?'USB 已连 · 待读取':'未连接设备';
    $('#usbConnect').textContent=live?'设备与连接':bridge?.fault?'重新连接 USB':'连接 USB';$('#usbConnect').disabled=busy||!navigator.hid;
    $('#hwDisconnect').disabled=!bridge||busy;for(const id of ['hwRead','hwRefresh','hwReadOne','hwMclkOn','hwMclkOff'])$('#'+id).disabled=busy||!live;
    $('#hwConnectionFields').disabled=busy;$('#hwAddress').disabled=busy||live;$('#hwTimeout').disabled=busy||live;$('#hwMclk').disabled=busy;$('#hwScopeFields').disabled=busy;
    for(const id of ['hwImport','hwExport'])$('#'+id).disabled=busy||!ready;
    let addr;try{addr=parseHex($('#hwRegAddress').value);}catch{}$('#hwWriteOne').disabled=busy||!ready||!C.masks[addr];$('#hwCancel').disabled=!busy;$('#hwCancel').hidden=!busy;
    $('#settingsAction').hidden=inspectOnly;$('#planDetails').hidden=inspectOnly;$('.hardware-progress').hidden=!busy;
    $('#hwDeviceInfo').textContent=session?.snapshot?'ID '+hex(session.snapshot[0])+' · 地址 '+hex(bridge.i2cAddress)+' · 完整读回 '+new Date(session.readAt).toLocaleTimeString()+(session.stale?' · 旧快照':'')+(bridge?.reports?' · OUT/IN '+bridge.reports.output.bytes+'/'+bridge.reports.input.bytes+' B':''):'尚无完整设备读回';
    let plan=null,error='';if(ready&&!inspectOnly)try{plan=planFor(opt);}catch(e){error=e.message;}
    $('#hwApply').disabled=busy||!ready||Boolean(error)||inspectOnly;
    $('#hwApply').textContent=!live?'请先连接 USB':!ready?'请先重新读回':busy?'正在核验…':'写入'+(opt.label.length>10?'当前模块':opt.label)+'并核验';
    $('#hwPlanCount').textContent=plan?plan.steps.length+' 项':'未就绪';$('#hwPlanError').hidden=!error;$('#hwPlanError').textContent=error;
    $('#hwPlanRows').innerHTML=plan?(plan.steps.length?plan.steps.map(p=>'<tr><td>'+hex(p.address)+'</td><td>'+escape(p.label)+'</td><td>'+hex(p.before)+'</td><td class="pending">'+hex(p.after)+'</td><td>'+hex(p.mask)+'</td></tr>').join(''):'<tr><td colspan="5">本模块与设备读回一致。</td></tr>'):'<tr><td colspan="5">'+(error?'参数需修正。':'连接并读取后显示差异。')+'</td></tr>';
    $('#hwPlanNotes').textContent='范围：'+opt.label+'。'+(opt.scope?'只修改所选模块的位。':'')+'写入前重新读取，写后逐项核验。'+(plan?.notes.length?' '+plan.notes.join('；'):'');
    if(!busy){if(failure)setStatus('操作未完成',failure);else if(error)setStatus('参数尚不能下发',error);else if(ready&&plan)setStatus(plan.steps.length?opt.label+' · '+plan.steps.length+' 项待写入':'与设备读回一致',plan.steps.length?'调整仅保存在草稿；点击下方按钮写入当前模块。':'下次写入仍会重新读取并核验。最近读回 '+new Date(session.readAt).toLocaleTimeString());else setStatus(lastMessage,lastDetail);}
    $('#canvasNotice').textContent=busy?lastMessage:ready?'设备已读回 · 编辑后在悬窗底部写入':bridge?.fault?'通信待恢复 · 重新连接 USB':'完整路径 · 点击模块设置，右上角连接 USB';
    renderOperation();
    $('#hwAdapterNotice').hidden=T.adapterProfile(bridge?.device)?.kind!=='S3';renderDebug();window.dispatchEvent(new Event('audiolab:hardwarestate'));
  }
  function describeError(error){const d=error.details||{};let text=error.message;if(d.attempted?.length)text+='；已尝试 '+d.attempted.length+' 个地址，恢复 '+d.restored.length+' 个'+(d.restoreFailed.length?'，'+d.restoreFailed.length+' 个未确认恢复，请核对连接并重新读回。':'，已改位已恢复。');if(d.recoveryConflicts?.length)text=text.replace(/。$/,'')+'；目标位发生外部变化，未覆盖新值。';return text;}
  async function run(action,prepare){if(busy)return;failure='';busy=true;const operation={cancelled:false};activeRun=operation;let outcome;try{const request=prepare?.();$('#hwProgress').value=0;$('#hwProgress').max=1;$('#hwProgressLabel').textContent=monitorFlight?'等待现有读取结束…':'准备操作…';render();if(monitorFlight)await monitorFlight.catch(()=>{});if(operation.cancelled){if(quickState.phase==='applying')quickState={phase:'cancelled',message:'Quick Start 已取消，未开始写入。'};setStatus('操作已取消','未开始新的操作。');A.toast('已取消排队操作，未开始写入');return;}outcome=await action(request);}catch(e){if(quickState.phase==='applying')quickState={phase:'error',message:describeError(e)};failure=describeError(e);setStatus('操作未完成',failure);A.toast(failure);}finally{if(activeRun===operation)activeRun=null;busy=false;updateSnapshot();render();}return outcome;}
  async function connect(){if(!navigator.hid){A.toast('请使用支持 WebHID 的桌面 Chrome / Edge');return;}if(available()||busy)return;const timeout=Number($('#hwTimeout').value),mclk=A.getReferenceMclk();if(timeout<200||timeout>5000||!Number.isInteger(timeout)||mclk<1e6||mclk>5e7){A.toast('请检查参考时钟和通信超时');return;}
    failure='';quickState={phase:'idle',message:''};busy=true;stopMonitor();bridgeStatus=null;render();const token=++generation;try{if(monitorFlight)await monitorFlight.catch(()=>{});if(bridge)await bridge.close();const picked=await navigator.hid.requestDevice({filters:T.deviceFilters()});if(!picked.length){setStatus('未选择设备','继续编辑草稿，尚未连接设备。');return;}
      bridge=new T.HidBridge(picked[0],{i2cAddress:Number($('#hwAddress').value),timeoutMs:timeout,onLog:log,onState:(state,error)=>{if(token!==generation)return;if(state==='disconnected'){stopMonitor('设备已断开，监视已停止');bridgeStatus=null;if(session)session.stale=true;setStatus('设备已断开','旧读回已标记，重新连接后再写入。');}if(state==='fault'){stopMonitor('通信故障，监视已停止');bridgeStatus=null;if(session)session.stale=true;setStatus('通信已停止',error.message);}updateSnapshot();render();}});
      session=new S.RegisterSession(bridge,{onProgress:progress});await bridge.open();if(T.adapterProfile(bridge.device)?.fixedAudio){A.setReferenceMclk(12288000);}if(T.adapterProfile(bridge.device)?.kind==='S3')bridgeStatus={...(await bridge.getStatus()),readAt:new Date().toISOString()};$('#hwImportNotes').hidden=true;setStatus('正在读回设备','连接时只读取，不自动写入。');await session.readAll();setStatus('设备已读回','点击框图模块设置，并在悬窗底部写入。');
    }catch(error){setStatus('连接 / 读回未完成',error.name==='NotFoundError'?'未选择 USB 设备。':describeError(error));if(session)session.stale=true;A.toast(lastDetail);}finally{busy=false;updateSnapshot();render();}
  }
  $('#usbConnect').addEventListener('click',()=>{A.navigate('hardware');if(!available())connect();});
  $('#hwDisconnect').addEventListener('click',async()=>{++generation;quickState={phase:'idle',message:''};stopMonitor('设备已断开，监视已停止');bridgeStatus=null;session?.cancel();if(session)session.stale=true;busy=true;setStatus('正在断开设备','写入已禁用。');updateSnapshot();render();try{if(monitorFlight)await monitorFlight.catch(()=>{});await bridge?.close();}finally{busy=false;failure='';setStatus('设备已断开','保留旧读回；重连不会自动下发。');updateSnapshot();render();}});
  const readAll=()=>run(async()=>{setStatus('正在重新读回','草稿不会被覆盖。');await session.readAll();setStatus('设备读回完成','草稿保留；差异已更新。');});$('#hwRead').addEventListener('click',readAll);$('#hwRefresh').addEventListener('click',readAll);
  $('#hwApply').addEventListener('click',()=>run(async({config,opt})=>{setStatus('正在写入'+opt.label,'每个地址均读回核验；其他模块保留。');const result=await session.apply(config,opt);setStatus(opt.label+'已核验','实际写入 '+result.writes+' 次；最终完整读回通过。');A.toast(result.writes?opt.label+'已写入设备，读回核验通过':'设备当前值已核验，无需写入');},()=>{const config=A.validateConfig(A.getConfig()),opt=options();assertAdapterFormat(config,opt);if(!opt.groups.length)throw new Error('没有选中参数范围');return{config,opt};}));
  $('#hwCancel').addEventListener('click',cancel);
  $('#hwImport').addEventListener('click',()=>{try{const decoded=C.decode(session.snapshot,A.getConfig(),options());A.importHardwareConfig(decoded.config);$('#hwImportNotes').hidden=false;$('#hwImportNotes').textContent=decoded.notes.join(' ');A.toast('设备标量已导入草稿；EQ 原始系数保留为蓝色读回曲线');render();}catch(e){A.toast(e.message);}});
  function download(name,data){const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  $('#hwExport').addEventListener('click',()=>download('AC10x-device-readback.json',{source:'actual USB HID / I2C readback',profile:$('#hwProfile').value,i2cAddress7:bridge.i2cAddress,completeReadAt:session.readAt,stale:session.stale,registers:session.snapshot}));
  function parseHex(v){if(!/^(0x)?[a-f0-9]{1,2}$/i.test(v))throw new Error('请输入 00–FF 十六进制字节');return parseInt(v.replace(/^0x/i,''),16);}
  $('#hwRegAddress').addEventListener('input',()=>{try{A.selectRegisterAddress(parseHex($('#hwRegAddress').value));}catch{}render();});
  $('#hwReadOne').addEventListener('click',()=>run(async()=>{const a=parseHex($('#hwRegAddress').value),v=await session.readOne(a);$('#hwRegValue').value=hex(v);$('#hwSingleResult').textContent='实际读回 '+hex(a)+' = '+hex(v);setStatus('单寄存器已读回');}));
  $('#hwWriteOne').addEventListener('click',()=>run(async({a,v})=>{const r=await session.writeOne(a,v);$('#hwSingleResult').textContent=hex(a)+'：'+hex(r.before)+' → '+hex(r.actual)+'，写后核验通过。';A.toast('寄存器已写入设备并核验');},()=>({a:parseHex($('#hwRegAddress').value),v:parseHex($('#hwRegValue').value)})));
  async function mclk(enabled){await run(async()=>{await bridge.setMclk(enabled);bridgeStatus=null;$('#hwMclkResult').textContent='适配器已应答 '+(enabled?'开启':'关闭')+'命令；未测量频率。';if(session)session.stale=true;setStatus('MCLK 命令已应答','时钟变化后请重新读回。');});}
  $('#hwMclkOn').addEventListener('click',()=>mclk(true));$('#hwMclkOff').addEventListener('click',()=>mclk(false));
  $('#hwLogExport').addEventListener('click',()=>download('AC10x-HID-log.json',{format:'AC10x-HID-log',schemaVersion:1,adapter:D.adapterInfo(bridge?.device),droppedEvents,events:logs}));
  $('#hwQueryBridge').addEventListener('click',()=>run(async()=>{bridgeStatus={...(await bridge.getStatus()),readAt:new Date().toISOString()};setStatus('桥接状态已读回','查询没有写入芯片寄存器。');}));
  $('#hwMuteDAC').addEventListener('click',()=>run(async()=>{await session.writeOne(0x1c,0);setStatus('设备 DAC 已静音','写入与读回核验完成；草稿差异已更新。');}));
  $('#hwRestoreLast').addEventListener('click',()=>run(async()=>{const r=await session.restoreLast();setStatus('上次写入已恢复','实际写入 '+r.writes+' 次；完整读回核验通过。');}));
  $('#hwSaveBaseline').addEventListener('click',()=>{if(!fresh()||busy)return;baselineRequest++;baseline={snapshot:{...session.snapshot},readAt:session.readAt,label:'设备读回 '+new Date(session.readAt).toLocaleTimeString(),adapter:D.adapterInfo(bridge.device)};render();});
  $('#hwLoadBaseline').addEventListener('click',()=>$('#hwBaselineFile').click());
  $('#hwBaselineFile').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;const request=++baselineRequest,selection=++baselineSelection;try{if(file.size>1024*1024)throw new Error('基线文件超过1MB');const text=await file.text();if(request!==baselineRequest)return;baseline={snapshot:D.normalizeSnapshot(text),label:file.name,readAt:null};render();A.toast('基线已导入，只用于比较');}catch(e){if(request===baselineRequest)A.toast('基线导入失败：'+e.message);}finally{if(selection===baselineSelection)event.target.value='';}});
  $('#hwExportDebug').addEventListener('click',()=>{try{download('AC10x-debug-bundle.json',{...D.debugBundle({referenceMclkHz:A.getReferenceMclk(),device:bridge?.device,snapshot:session?.snapshot,readAt:session?.readAt,stale:session?.stale||busy,draft:A.getConfig(),baseline,status:bridgeStatus,history:session?.history,events:logs,droppedEvents,diagnostics,monitor:monitorSamples}),operationInProgress:busy});}catch(e){A.toast('导出失败：'+e.message);}});
  $('#hwMonitorToggle').addEventListener('click',()=>{
    if(monitoring){stopMonitor();render();return;}
    try{monitorList=D.monitorAddresses($('#hwMonitorAddresses').value);const interval=Number($('#hwMonitorInterval').value);if(!Number.isInteger(interval)||interval<1000||interval>60000)throw new Error('监视间隔需为1000至60000毫秒');if(!available()||busy)return;monitoring=true;monitorDeadline=Date.now()+30*60*1000;$('#hwMonitorInfo').textContent='正在只读监视；写入时暂停。';scheduleMonitor(0);render();}catch(e){A.toast(e.message);}
  });
  $('#hwMonitorExport').addEventListener('click',()=>{
    const text='time,address_hex,value_hex\r\n'+monitorSamples.map(x=>x.time+','+hex(x.address)+','+hex(x.value)).join('\r\n'),url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='AC10x-register-monitor.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  window.addEventListener('audiolab:configimport',event=>{if(['AC101S','AC102'].includes(event.detail?.profile))$('#hwProfile').value=event.detail.profile;render();});
  $('#hwProfile').addEventListener('change',()=>A.setTargetProfile($('#hwProfile').value));
  if(['AC101S','AC102'].includes(A.getConfig().profile))$('#hwProfile').value=A.getConfig().profile;
  window.addEventListener('audiolab:referenceclockchange',render);
  $$('[data-hw-group],#hwMclk,#hwProfile').forEach(el=>el.addEventListener('change',render));for(const event of ['audiolab:configchange','audiolab:viewchange','audiolab:registerselect'])window.addEventListener(event,render);
  window.addEventListener('pagehide',()=>{++generation;stopMonitor();if(logPaint!==null)clearTimeout(logPaint);logPaint=null;session?.cancel();bridge?.close().catch(()=>{});});
  function cancel(){const fromButton=['hwCancel','quickStartCancel'].includes(document.activeElement?.id);if(activeRun)activeRun.cancelled=true;session?.cancel();$('#hwProgressLabel').textContent='等待当前通信结束，然后取消并尝试恢复…';renderOperation();if(fromButton){const target=$('#settingsWindow').hidden?$('#canvasScroll'):$('#inspectorTitle');target.tabIndex=-1;target.focus({preventScroll:true});}}
  const cloneState=x=>x?JSON.parse(JSON.stringify(x)):null;
  function quickStart(exampleId='default'){return run(async request=>{
    setStatus('正在应用 Quick Start：'+request.meta.name,'正在写入所选方案，并逐项核验。');
    const result=await session.apply(request.config,request.opt);
    const unchanged=request.generation===generation&&request.revision===A.getDraftRevision();
    if(unchanged)A.importHardwareConfig(request.config,{presetId:request.meta.presetId});
    quickState={phase:'verified',exampleId:request.meta.id,name:request.meta.name,message:unchanged?'已写入并核验：'+request.meta.name+'；点击图上模块继续调整。':'Quick Start 提交时配置已核验；保留你随后修改的草稿，图中显示设备读回。',writes:result.writes};
    setStatus('Quick Start 已核验',quickState.message);A.toast(quickState.message);return cloneState(quickState);
  },()=>{
    quickState={phase:'applying',message:'Quick Start 正在检查并写入配置。'};
    if(!fresh())throw Error('请先连接并完整读回设备');
    const profile=T.adapterProfile(bridge.device),base=A.getConfig(),meta=AudioExamples.quickExamples.find(x=>x.id===exampleId);
    if(!meta)throw Error('未知 Quick Start 方案');
    const config=A.validateConfig(AudioExamples.quickExample(exampleId,base,{fixedAudio:Boolean(profile?.fixedAudio),lineDifferential:Boolean(session.snapshot[0x26]&16)}));
    const opt={groups:['routing','eq','dynamics','clock'],scope:null,label:meta.name,mclkHz:profile?.fixedAudio?12288000:A.getReferenceMclk(),profile:base.profile};
    assertAdapterFormat(config,opt);C.makePlan(config,session.snapshot,opt);
    if(profile?.fixedAudio)A.setReferenceMclk(12288000);
    quickState={phase:'applying',message:'Quick Start 正在写入并核验；请等待完成。'};
    return{config,opt,meta:{...meta},generation,revision:A.getDraftRevision()};
  });}
  const picker=$('#quickStartPicker');let pickerReturn=null,pickerInert=[];
  function closeQuickStart(restore=true){picker.hidden=true;$('#quickStart').setAttribute('aria-expanded','false');for(const [el,previous]of pickerInert)el.inert=previous;pickerInert=[];if(restore&&pickerReturn?.isConnected&&!pickerReturn.disabled)pickerReturn.focus();}
  function openQuickStart(){if(busy)return;if(!picker.hidden){closeQuickStart();return;}pickerReturn=document.activeElement;picker.hidden=false;$('#quickStart').setAttribute('aria-expanded','true');pickerInert=[...document.body.children].filter(el=>el!==picker&&!['SCRIPT','STYLE','LINK'].includes(el.tagName)).map(el=>[el,el.inert]);for(const [el]of pickerInert)el.inert=true;renderOperation();AudioI18n.refresh();$('#closeQuickStart').focus();}
  for(const meta of AudioExamples.quickExamples){const card=document.createElement('article');card.className='quick-start-card';card.innerHTML='<div class="quick-start-card-heading"><h3>'+escape(meta.name)+'</h3><span>'+escape(meta.tag)+'</span></div><p>'+escape(meta.note)+'</p><p class="quick-start-path">'+escape(meta.path)+'</p><p class="quick-start-effect">'+escape(meta.effect)+'</p><button type="button" class="btn primary" data-quick-apply="'+escape(meta.id)+'" aria-label="'+escape(meta.name+' · 写入并核验')+'">写入并核验</button>';$('#quickStartCards').append(card);card.querySelector('button').addEventListener('click',()=>{if(busy||!fresh())return;closeQuickStart(false);const target=$('#settingsWindow').hidden?$('#canvasScroll'):$('#inspectorTitle');target.tabIndex=-1;target.focus({preventScroll:true});quickStart(meta.id);});}
  $('#quickStart').addEventListener('click',openQuickStart);$('#closeQuickStart').addEventListener('click',()=>closeQuickStart());
  $('#quickStartConnect').addEventListener('click',()=>{closeQuickStart(false);$('#usbConnect').click();});
  picker.addEventListener('click',event=>{if(event.target===picker)closeQuickStart();});
  document.addEventListener('keydown',event=>{if(picker.hidden||event.isComposing)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeQuickStart();}else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();event.stopImmediatePropagation();}else if(event.key==='Tab'){const controls=[...picker.querySelectorAll('button')].filter(el=>!el.disabled&&!el.hidden&&!el.closest('[hidden]'));const index=controls.indexOf(document.activeElement);if(event.shiftKey&&index<=0){event.preventDefault();controls.at(-1)?.focus();}else if(!event.shiftKey&&index===controls.length-1){event.preventDefault();controls[0]?.focus();}}},true);
  $('#quickStartCancel').addEventListener('click',cancel);
  window.AudioHardwareUI={getState(){return{connected:available(),fresh:fresh(),busy,generation,profile:$('#hwProfile').value,referenceMclk:A.getReferenceMclk(),snapshot:cloneState(session?.snapshot),readAt:session?.readAt||null,adapter:D.adapterInfo(bridge?.device),failure,message:lastMessage,detail:lastDetail,quickStart:cloneState(quickState)};},connect,read:readAll,quickStart,cancel};
  if(!navigator.hid){$('#hwCapability').textContent='WEBHID 不可用';$('#hwBrowserNote').textContent='请用支持 WebHID 的桌面 Chrome / Edge 打开。';}
  renderLogs();render();
})();
