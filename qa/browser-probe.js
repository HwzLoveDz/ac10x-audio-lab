/* QA-only visible state checker; actions still enter through the actual product controls. */
(() => {
 const $=s=>document.querySelector(s);
 const panel=document.createElement('aside');panel.id='qaIsolationPanel';panel.dataset.noI18n='';
 panel.style.cssText='position:fixed;z-index:10000;right:12px;bottom:60px;width:390px;max-width:calc(100vw - 24px);font:10px monospace;background:#fffceb;border:1px solid #967e20;padding:5px;pointer-events:none';
 panel.innerHTML='<button id="qaAssert" style="pointer-events:auto">QA: Check invariants</button><label style="pointer-events:auto"><input type="checkbox" id="qaDelayFile">Delay file read</label><button id="qaReleaseFile" style="pointer-events:auto">Release file read</button><output id="qaResult" style="display:block;white-space:pre-wrap;overflow-wrap:anywhere">Isolated HTTP test. Native device/audio/network APIs blocked.</output>';
 document.body.append(panel);
 $('#qaDelayFile').addEventListener('change',e=>QAIsolation.fileReads.delay=e.target.checked);
 $('#qaReleaseFile').addEventListener('click',()=>QAIsolation.fileReads.pending.splice(0).forEach(resolve=>resolve()));
 let lastFocus=document.activeElement,steps=0;
 document.addEventListener('focusin',e=>{if(!panel.contains(e.target))lastFocus=e.target;},true);
 $('#qaAssert').addEventListener('pointerdown',()=>{lastFocus=document.activeElement;},true);
 $('#qaAssert').addEventListener('click',()=>{
  const problems=[],check=(ok,message)=>{if(!ok)problems.push(message);};
  const cfg=AudioLab.getConfig(),ctx=AudioLab.getContext(),ref=AudioLab.getReferenceMclk();
  try{AudioLab.validateConfig(cfg);}catch(e){problems.push('invalid-config: '+e.message);}
  check(QAIsolation.installed,'isolation-missing');
  check($('#hwProfile').value===cfg.profile,'profile-mismatch');
  check(Number($('#hwMclk').value)===ref&&Number($('#legacyExportMclk').value)===ref,'MCLK-mismatch');
  if($('#settingsWindow').hidden)check(ctx.view==='path','hidden-panel-context');
  else {
   check(document.body.dataset.view===ctx.view&&document.body.dataset.selectedNode===ctx.node,'body-context');
   check($('#view-'+(ctx.view==='path'?'node':ctx.view))?.classList.contains('active'),'active-view');
   if(ctx.view==='dynamics')check($('#inspectorTitle').textContent.includes(ctx.node==='hpf'?'HPF':'AGC'),'dynamics-title');
   if(ctx.view==='route')check($('#routeViewSelect').value===document.body.dataset.activeRoute,'route-select');
   if(ctx.view==='eq')check(ctx.node==='eq','eq-context');
   if(ctx.view==='clock')check(ctx.node==='clock','clock-context');
   if(ctx.view==='audio')check(AudioRouting.equivalent(cfg,AudioLab.getAuditionConfig()),'stale-audition');
  }
  if(lastFocus?.isConnected&&lastFocus!==document.body){
   check(!lastFocus.closest('[hidden],.view:not(.active)'),'hidden-focus: '+lastFocus.id);
   check(!lastFocus.closest('details:not([open])')||Boolean(lastFocus.closest('summary')),'folded-focus: '+lastFocus.id);
  }
  check(QAIsolation.errors.length===0,'script-errors: '+QAIsolation.errors.join(';'));
  const result={step:++steps,status:problems.length?'FAILED':'PASSED',problems,view:ctx.view,node:ctx.node,profile:cfg.profile,mclk:ref,lang:document.documentElement.lang,pendingFiles:QAIsolation.fileReads.pending.length,calls:QAIsolation.calls};
  $('#qaResult').textContent=JSON.stringify(result);$('#qaResult').dataset.status=result.status;
 });
})();
