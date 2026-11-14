/* Discoverable navigation only. No native device/audio access or parameter writes. */
(() => {
  'use strict';
  const A=window.AudioLab,$=s=>document.querySelector(s),dialog=$('#featureFinder');
  const themeButton=$('#themeSwitch'),themeKey='ac10x-audio-lab-theme';
  function setTheme(value,persist=false){
    const theme=value==='dark'?'dark':'light';
    document.documentElement.dataset.theme=theme;
    themeButton.setAttribute('aria-pressed',String(theme==='dark'));
    if(persist)try{localStorage.setItem(themeKey,theme);}catch{}
  }
  let preferredTheme='light';try{preferredTheme=localStorage.getItem(themeKey)||'light';}catch{}
  setTheme(preferredTheme);
  themeButton.addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark',true));
  let returnFocus=null;
  function locate(view,target){A.navigate(view);const el=$(target);if(!el)return;for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;if(el.tagName==='DETAILS')el.open=true;el.scrollIntoView?.({block:'center',behavior:'auto'});if(el.matches('button,input,select')&&!el.disabled)el.focus();else{const focus=el.disabled?(el.closest('article,details')||el.parentElement):el;focus.tabIndex=-1;focus.focus();}}
  const entries=[
    {id:'overview',label:'信号图',en:'Signal graph',run:()=>A.openOverview()},
    {id:'quick-start',label:'定位 Quick Start 写入按钮',en:'Locate Quick Start write button',keywords:'setup baseline initialize',run:()=>{A.openOverview();const button=$('#quickStart');if(button.disabled){$('#quickStartStatus').tabIndex=-1;$('#quickStartStatus').focus();}else button.focus();}},
    {id:'eq',label:'EQ 与预设',en:'EQ and presets',keywords:'equalizer bass treble filter',run:()=>A.navigate('eq')},
    {id:'pga',label:'麦克风输入增益',en:'Microphone input gain',keywords:'pga mic analog',run:()=>A.openNode('pga')},
    {id:'input',label:'输入与麦克风选择',en:'Input and microphone selection',keywords:'AMIC DMIC ECM',run:()=>A.openNode('input')},
    {id:'bias',label:'麦克风偏置',en:'Microphone bias',keywords:'bias micbias',run:()=>A.openNode('bias')},
    {id:'agc',label:'自动增益 AGC',en:'Automatic gain AGC',run:()=>A.openNode('agc')},
    {id:'hpf',label:'高通滤波 HPF',en:'High pass filter HPF',run:()=>A.openNode('hpf')},
    {id:'adcvol',label:'录音数字音量',en:'Recording digital volume',keywords:'ADC gain mute',run:()=>A.openNode('adcvol')},
    {id:'dacvol',label:'播放数字音量',en:'Playback digital volume',keywords:'DAC gain mute',run:()=>A.openNode('dacvol')},
    {id:'lineamp',label:'模拟输出增益',en:'Analog output gain',keywords:'speaker line out amp',run:()=>A.openNode('lineamp')},
    {id:'dacmix',label:'监听与 DAC 混音',en:'Monitoring and DAC mixer',keywords:'monitor sidetone',run:()=>A.openNode('dacmix')},
    {id:'clock',label:'时钟与接口格式',en:'Clock and interface format',keywords:'I2S PCM sample rate bits',run:()=>A.navigate('clock')},
    {id:'reference-clock',label:'共用 MCLK 参考',en:'Shared MCLK reference',keywords:'frequency divider export',run:()=>locate('clock','#hwMclk')},
    {id:'hardware',label:'设备连接与诊断',en:'Device connection and diagnostics',keywords:'USB HID S3 S31 TI I2C',run:()=>A.navigate('hardware')},
    {id:'bridge-status',label:'桥接器状态',en:'Bridge status',keywords:'S3 S31 protocol errors',run:()=>locate('hardware','#hwQueryBridge')},
    {id:'readback-draft',label:'设备读回转入草稿',en:'Copy device readback into draft',keywords:'sync import snapshot',run:()=>locate('hardware','#hwImport')},
    {id:'baseline',label:'基线与变化比较',en:'Baseline and change comparison',keywords:'compare snapshot diff',run:()=>locate('hardware','#hwSaveBaseline')},
    {id:'monitor',label:'只读寄存器监视',en:'Read only register monitor',keywords:'watch poll',run:()=>locate('hardware','#hwMonitorAddresses')},
    {id:'mute',label:'DAC 静音与恢复',en:'DAC mute and restore',keywords:'stop undo',run:()=>locate('hardware','#hwMuteDAC')},
    {id:'undo',label:'恢复上次已核验写入',en:'Restore last verified write',keywords:'undo rollback',run:()=>locate('hardware','#hwRestoreLast')},
    {id:'logs',label:'通信记录',en:'Communication log',keywords:'HID packet trace',run:()=>locate('hardware','#hwLogExport')},
    {id:'debug-bundle',label:'导出完整调试包',en:'Export complete debug bundle',keywords:'support evidence diagnostics',run:()=>locate('hardware','#hwExportDebug')},
    {id:'registers',label:'单寄存器与读回表',en:'Single register and readback table',keywords:'hex address raw',run:()=>locate('registers','#hwRegAddress')},
    {id:'legacy',label:'旧文件迁移与比较',en:'Legacy file migration and comparison',keywords:'AC102 CSV text import',run:()=>locate('registers','#legacyTools')},
    {id:'mcu-export',label:'主控掩码表导出',en:'MCU masked register export',keywords:'C header firmware export',run:()=>locate('registers','#exportMaskedRegisters')},
    {id:'preview',label:'试听当前 EQ',en:'Preview current EQ',keywords:'browser listen AB audio',run:()=>A.navigate('audio')},
    {id:'capture',label:'声卡录音与频谱',en:'Sound card recording and spectrum',keywords:'USB microphone FFT WAV capture',run:()=>locate('audio','#captureDevice')},
    {id:'wav',label:'导出试听 WAV',en:'Export preview WAV',keywords:'audio recording save',run:()=>locate('audio','#exportWav')},
    {id:'import-draft',label:'导入草稿',en:'Import draft',keywords:'JSON configuration open',run:()=>{A.navigate('hardware');$('#importConfig').click();}},
    {id:'export-draft',label:'导出草稿',en:'Export draft',keywords:'JSON configuration save',run:()=>$('#exportConfig').click()},
    {id:'fit',label:'适合窗口',en:'Fit to window',keywords:'reset zoom pan canvas',run:()=>$('#routeFit').click()},
    {id:'release',label:'版本与支持范围',en:'Version and supported scope',keywords:'S3 S31 TI release firmware protocol',run:()=>locate('hardware','#releaseInfo')}
  ];
  function close(restore=true){dialog.hidden=true;$('#openFeatureFinder').setAttribute('aria-expanded','false');if(restore&&returnFocus?.isConnected)returnFocus.focus();}
  function run(entry){close(false);entry.run();const focus=document.activeElement,fold=focus?.closest('details:not([open])');if(!focus||focus===document.body||!focus.isConnected||focus.closest('[hidden],.view:not(.active)')||(fold&&!focus.closest('summary'))){const target=entry.id==='fit'||$('#settingsWindow').hidden?$('#canvasScroll'):$('#inspectorTitle');target.tabIndex=-1;target.focus();}}
  function render(){
    const normalize=value=>String(value).normalize('NFKC').toLowerCase(),words=normalize($('#featureQuery').value).trim().split(/\s+/).filter(Boolean),found=entries.filter(e=>{const text=normalize(e.label+' '+AudioI18n.translate(e.label)+' '+e.en+' '+(e.keywords||''));return words.every(word=>text.includes(word));});
    const list=$('#featureResults');list.replaceChildren();
    for(const entry of found){const button=document.createElement('button');button.type='button';button.dataset.feature=entry.id;button.textContent=entry.label;button.addEventListener('click',()=>run(entry));list.append(button);}
    if(!found.length){const note=document.createElement('p');note.textContent='没有找到；可尝试模块名称或英文缩写。';list.append(note);}
    $('#featureResultCount').replaceChildren(document.createTextNode(found.length+' '),document.createTextNode('个匹配功能'));
  }
  function open(){if(!dialog.hidden){close();return;}returnFocus=document.activeElement;dialog.hidden=false;$('#openFeatureFinder').setAttribute('aria-expanded','true');$('#featureQuery').value='';render();$('#featureQuery').focus();}
  function activeNav(){const ctx=A.getContext(),overview=$('#settingsWindow').hidden||['path','route'].includes(ctx.view);for(const el of document.querySelectorAll('[data-workspace]')){const active=overview?el.dataset.workspace==='overview':el.dataset.workspace===ctx.view;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');}}
  for(const el of document.querySelectorAll('[data-workspace]'))el.addEventListener('click',()=>el.dataset.workspace==='overview'?A.openOverview():A.navigate(el.dataset.workspace));
  for(const el of document.querySelectorAll('[data-find-feature]'))el.addEventListener('click',()=>run(entries.find(e=>e.id===el.dataset.findFeature)));
  $('#openFeatureFinder').addEventListener('click',open);$('#closeFeatureFinder').addEventListener('click',()=>close());$('#featureQuery').addEventListener('input',render);
  dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
  document.addEventListener('keydown',e=>{
    if(e.isComposing||e.keyCode===229)return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();e.stopImmediatePropagation();open();return;}
    if(dialog.hidden)return;
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();return;}
    const buttons=[...$('#featureResults').querySelectorAll('button')],current=buttons.indexOf(document.activeElement);
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const next=e.key==='ArrowDown'?Math.min(buttons.length-1,current+1):Math.max(0,current-1);buttons[next]?.focus();}
    if(e.key==='Enter'&&document.activeElement===$('#featureQuery')){e.preventDefault();buttons[0]?.click();}
    if(e.key==='Tab'){const focusable=[$('#closeFeatureFinder'),$('#featureQuery'),...buttons],i=focusable.indexOf(document.activeElement);if(e.shiftKey&&i===0){e.preventDefault();focusable.at(-1).focus();}else if(!e.shiftKey&&i===focusable.length-1){e.preventDefault();focusable[0].focus();}}
  },true);
  for(const el of document.querySelectorAll('[data-app-version]'))el.textContent='v'+AudioDebug.VERSION;
  window.addEventListener('audiolab:viewchange',activeNav);window.addEventListener('audiolab:languagechange',()=>{if(!dialog.hidden)render();});activeNav();
})();
