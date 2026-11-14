/* AC102 routing facts: User Manual v1.0, Fig 9-24 and registers 0x07/11/13/16/18/19/1B/1D/26.
 * A local reference graph; never communicates with hardware. */
(function(root){
  'use strict';
  const W=2176,H=968;
  const defaults=()=>({input:'analog',mbias:true,rxEnabled:true,txEnabled:true,sdoEnabled:true,rxMap:[0,1,2,3],txMap:[0,1,0,1],rx:{left:true,right:false,leftHalf:false,rightHalf:false},dac:{rx:true,rec:false,rxHalf:false,recHalf:false},txL:{rec:true,play:false,recHalf:false,playHalf:false},txR:{rec:true,rx:false,recHalf:false,rxHalf:false},lineOut:true,lineGain:0,lineDifferential:false,adcPattern:0,dacPattern:0});
  // AC102 User Manual 0x26: attenuation increases with the code. Single-ended
  // codes 0/1/2 all mean 0dB; differential codes span 0 to -45dB.
  function lineGainDb(code,differential){return -3*(differential?code&15:Math.max(0,(code&15)-2))||0;}
  function lineGainCode(db,differential){const min=differential?-45:-39;if(!Number.isInteger(db)||db>0||db<min||db%3)throw new Error('当前 Line Out '+(differential?'差分':'单端')+'模式仅支持 '+min+' 至 0 dB，步进 3 dB');return db===0?0:-db/3+(differential?0:2);}
  function normalize(c){if(!c.routing)c.routing=defaults();return c;}
  function equivalent(a,b){if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&equivalent(a[k],b[k]));}
  function validate(c){const r=c.routing;if(!r||!['analog','dmic'].includes(r.input))throw new Error('输入路径选择无效');
    for(const k of ['mbias','rxEnabled','txEnabled','sdoEnabled','lineOut'])if(typeof r[k]!=='boolean')throw new Error('路由开关格式无效');
    for(const [group,keys] of Object.entries({rx:['left','right','leftHalf','rightHalf'],dac:['rx','rec','rxHalf','recHalf'],txL:['rec','play','recHalf','playHalf'],txR:['rec','rx','recHalf','rxHalf']})){if(!r[group]||keys.some(k=>typeof r[group][k]!=='boolean'))throw new Error('混音器配置无效');}
    for(const [key,max] of [['rxMap',3],['txMap',1]])if(!Array.isArray(r[key])||r[key].length!==4||r[key].some(v=>!Number.isInteger(v)||v<0||v>max))throw new Error('通道映射格式无效');
    if(!Number.isInteger(r.lineGain)||r.lineGain<-45||r.lineGain>0||r.lineGain%3)throw new Error('Line Out 增益需为 -45 至 0 dB，步进 3 dB');
    if(![0,1,2,3].includes(r.adcPattern)||![0,1,2,3].includes(r.dacPattern))throw new Error('调试源选择无效');return c;
  }
  const generated=[2,7,17,19,22,24,25,26,27,28,29,38];
  function registers(c,regs){const r=c.routing,b=Number;
    regs[2]=(regs[2]&~4)|(r.mbias?4:0);
    regs[7]=(regs[7]&~0x17)|(r.sdoEnabled?16:0)|(r.txEnabled?4:0)|(r.rxEnabled?2:0)|1;
    regs[17]=(regs[17]&0xf0)|r.txMap.reduce((v,x,i)=>v|(x<<i),0);
    regs[22]=r.rxMap.reduce((v,x,i)=>v|(x<<(i*2)),0);
    regs[19]=b(r.txL.rec)|(b(r.txL.play)<<1)|(b(r.txR.rec)<<2)|(b(r.txR.rx)<<3)|(b(r.txL.recHalf)<<4)|(b(r.txL.playHalf)<<5)|(b(r.txR.recHalf)<<6)|(b(r.txR.rxHalf)<<7);
    regs[24]=(regs[24]&0xf0)|b(r.rx.left)|(b(r.rx.right)<<1)|(b(r.rx.leftHalf)<<2)|(b(r.rx.rightHalf)<<3);
    regs[29]=(regs[29]&0xf0)|b(r.dac.rx)|(b(r.dac.rec)<<1)|(b(r.dac.rxHalf)<<2)|(b(r.dac.recHalf)<<3);
    regs[25]=(regs[25]&~0xb0)|(r.input==='dmic'?128:0)|(r.adcPattern<<4);
    regs[27]=(regs[27]&~6)|(r.dacPattern<<1);
    regs[26]=Math.round((c.adc.gain+64)*2+1);regs[28]=Math.round((c.dac.gain+64)*2+1);
    regs[38]=(regs[38]&~0x2f)|(r.lineOut?32:0)|lineGainCode(r.lineGain,Boolean(regs[38]&16));
    return regs;
  }
  const nodes=[
    ['bias',40,82,136,76,'MIC BIAS','麦克风偏置','power'],
    ['input',40,240,136,76,'MICP / MICN','模拟差分输入','analog'],
    ['pga',232,240,136,76,'PGA','','analog'],
    ['adc',424,240,136,76,'ΣΔ ADC','模拟调制器','analog'],
    ['source',616,240,136,76,'AMIC/DMIC','输入选择','record'],
    ['decim',808,240,136,76,'DECIM','抽取滤波','record'],
    ['hpf',1000,240,136,76,'HPF','','record'],
    ['agc',1192,240,136,76,'AGC','','record'],
    ['adcvol',1384,240,136,76,'ADC DVC','','record'],
    ['dmicport',40,400,136,76,'DMIC I/O','MICP: CLK · MICN: DATA','record'],
    ['dmic',424,400,136,76,'DMIC','PDM 接收','record'],
    ['adcdebug',808,400,300,76,'ADC TEST SOURCE','','debug'],
    ['clock',1000,82,300,76,'MCLK · BCLK · LRCK','时钟与接口配置','power'],
    ['control',1384,82,300,76,'TWI · SCL / SDA','USB HID → I²C','power'],
    ['txl',1768,240,136,76,'TX_MIXL','','mix'],
    ['txr',1768,408,136,76,'TX_MIXR','','mix'],
    ['txmap',2000,258,136,76,'TX MAP','CH1–4 映射','digital'],
    ['tx',2000,82,136,76,'SDOUT','I²S / PCM TX','digital'],
    ['rx',40,764,136,76,'SDIN','I²S / PCM RX','digital'],
    ['rxmap',232,764,136,76,'RX MAP','CH1–4 映射','digital'],
    ['rxmix',424,764,136,76,'RX_MIX','','mix'],
    ['dacmix',672,764,136,76,'DAC_MIX','','mix'],
    ['eq',864,764,136,76,'3-BAND EQ','','play'],
    ['dacvol',1056,764,136,76,'DAC DVC','','play'],
    ['interp',1304,764,136,76,'INTP','插值滤波','play'],
    ['dac',1496,764,136,76,'ΣΔ DAC','DAC · 模拟 LPF','play'],
    ['lineamp',1688,764,136,76,'LINE AMP','','analog'],
    ['output',1880,764,136,76,'LOUTP / N','模拟差分输出','analog'],
    ['dacdebug',808,640,300,76,'DAC TEST SOURCE','','debug']
  ];
  const nodeMap=Object.fromEntries(nodes.map(n=>[n[0],n]));
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function edgePaths(e,color,prefix,ui){const arrow=e.shared||(prefix==='route-arrow-'&&['rec','rxm','play'].includes(e.to))?'':' marker-end="url(#'+prefix+color+')"';return '<path class="edge-halo" d="'+e.d+'"/><path class="edge-line '+e.group+'" d="'+e.d+'"'+arrow+'/>'+(e.on&&ui.animate!==false?'<path class="edge-flow" aria-hidden="true" fill="none" stroke="none" d="'+e.d+'" style="animation-delay:'+(Number.isFinite(ui.flowOffset)?ui.flowOffset:0)+'s"/>':'')+(e.label?'<text class="edge-caption '+e.group+'" x="'+e.lx+'" y="'+e.ly+'" text-anchor="middle">'+esc(e.label)+'</text>':'');}
  function graph(c){const r=c.routing,analog=r.input==='analog',dmic=!analog,rec=c.adc.enabled&&(analog||c.clock.fs<=24000),rxSlots=r.rxMap.slice(0,c.clock.slots),rxLeft=r.rxEnabled&&r.rx.left&&rxSlots.includes(0),rxRight=r.rxEnabled&&r.rx.right&&rxSlots.includes(1),rx=rxLeft||rxRight,play=c.dac.enabled&&(r.dac.rx&&rx||r.dac.rec&&rec),tx=r.txEnabled&&r.sdoEnabled,txSlots=r.txMap.slice(0,c.clock.slots);
    const edges=[];
    function add(id,from,to,d,on,group,label='',lx=0,ly=0,kind='audio'){edges.push({id,from,to,d,on,group,label,lx,ly,kind});}
    add('bias-mic','bias','input','M108 158V240',r.mbias&&analog,'record','MBIAS',126,201,'control');
    add('mic-pga','input','pga','M176 278H232',analog,'record');
    add('pga-adc','pga','adc','M368 278H424',analog&&c.adc.enabled,'record');
    add('adc-mux','adc','source','M560 278H616',analog&&c.adc.enabled,'record');
    add('dmic-data','dmicport','dmic','M176 456H424',dmic&&c.clock.fs<=24000,'record','PDM DATA',300,493);
    add('dmic-clock','dmic','dmicport','M424 420H176',dmic&&c.clock.fs<=24000,'record','DMIC CLK',300,409,'control');
    add('dmic-mux','dmic','source','M560 438H684V316',dmic&&c.clock.fs<=24000,'record');
    add('mux-decim','source','decim','M752 278H808',rec,'record');
    add('decim-hpf','decim','hpf','M944 278H1000',rec,'record');
    add('hpf-agc','hpf','agc','M1136 278H1192',rec,'record');
    add('agc-adcvol','agc','adcvol','M1328 278H1384',rec,'record');
    add('adcvol-rec','adcvol','rec','M1520 278H1576',rec,'record');
    add('rec-txl','rec','txl','M1576 278H1768',rec&&r.txL.rec,'record','RECD_DAT',1672,266);
    add('rec-txr','rec','txr','M1576 446H1768',rec&&r.txR.rec,'record','RECD_DAT',1672,434);
    add('rec-dacmix','rec','dacmix','M1576 446V536H740V764',rec&&r.dac.rec,'monitor','录音 → DAC 监听',1158,524);
    add('play-txl','play','txl','M1248 802V640H1736V364H1836V316',play&&r.txL.play,'loopback','PLAY_DAT → TXL',1440,628);
    add('rxm-txr','rxm','txr','M616 584H1836V484',rx&&r.txR.rx,'loopback','RXM → TXR',1190,572);
    add('txl-map','txl','txmap','M1904 278H2000',tx&&txSlots.includes(0)&&(rec&&r.txL.rec||play&&r.txL.play),'record');
    add('txr-map','txr','txmap','M1904 446H1952V314H2000',tx&&txSlots.includes(1)&&(rec&&r.txR.rec||rx&&r.txR.rx),'record');
    add('map-sdout','txmap','tx','M2068 258V158',tx,'record');
    add('sdin-map','rx','rxmap','M176 802H232',r.rxEnabled,'play');
    add('rxl-mix','rxmap','rxmix','M368 784H424',rxLeft,'play','RXL',396,772);
    add('rxr-mix','rxmap','rxmix','M368 820H424',rxRight,'play','RXR',396,845);
    add('rxmix-rxm','rxmix','rxm','M560 802H616',rx,'play');
    add('rxm-dacmix','rxm','dacmix','M616 802H672',rx&&r.dac.rx,'play');
    add('dacmix-eq','dacmix','eq','M808 802H864',play,'play');
    add('eq-dacvol','eq','dacvol','M1000 802H1056',play,'play');
    add('dacvol-play','dacvol','play','M1192 802H1248',play,'play');
    add('play-interp','play','interp','M1248 802H1304',play,'play');
    add('interp-dac','interp','dac','M1440 802H1496',play,'play');
    add('dac-lineamp','dac','lineamp','M1632 802H1688',play,'play');
    add('lineamp-output','lineamp','output','M1824 802H1880',play&&r.lineOut,'play');
    add('rxm-adc-test','rxm','adcdebug','M616 584V496H752V438H808',rx&&r.adcPattern===3,'loopback','RXM 调试回环',690,484);
    add('adc-test-selector','adcdebug','decim','M958 400V364H876V316',r.adcPattern!==0,'debug','ADC_PTN_SEL',1000,352,'control');
    add('dac-test-selector','dacdebug','dac','M1108 678H1564V764',r.dacPattern!==0,'debug','DAC_PTN_SEL',1340,666,'control');
    const shared=[{id:'rxm-shared',from:'rxm',to:'rxm-fork',d:'M616 802V584',on:rx&&(r.txR.rx||r.adcPattern===3),group:'loopback',shared:true,label:'RXM',lx:638,ly:694}];
    const visualWires=[{id:'rec-trunk',from:'rec',to:'rec-fork',d:'M1576 278V446',on:rec,group:'record',shared:true,junctions:[[1576,446]]}];
    return{nodes,edges,shared,visualWires,taps:[['rec',1576,278,'RECD_DAT',rec],['rxm',616,802,'RXM',rx],['play',1248,802,'PLAY_DAT',play]],state:{rec,rx,play,tx,analog,dmic}};
  }
  function sublabel(n,c,g){const r=c.routing,s=g.state;return ({pga:c.pga+' dB',hpf:c.hpf.enabled?c.hpf.freq+' Hz':'BYPASS',agc:c.agc.enabled?'目标 '+c.agc.target+' dBFS':'BYPASS',adcvol:c.adc.mute?'MUTE':c.adc.gain+' dB',dacvol:c.dac.mute?'MUTE':c.dac.gain+' dB',eq:c.eq.enabled?c.eq.bands.filter(b=>b.enabled).length+' 段启用':'BYPASS',lineamp:r.lineGain+' dB · '+(r.lineOut?'ON':'OFF'),source:r.input==='analog'?'模拟输入':'数字麦克风',rxmix:[r.rx.left?'L':'',r.rx.right?'R':''].filter(Boolean).join(' + ')||'OFF',dacmix:[r.dac.rx?'RXM':'',r.dac.rec?'REC':''].filter(Boolean).join(' + ')||'OFF',txl:[r.txL.rec?'REC':'',r.txL.play?'PLAY':''].filter(Boolean).join(' + ')||'OFF',txr:[r.txR.rec?'REC':'',r.txR.rx?'RXM':''].filter(Boolean).join(' + ')||'OFF',adcdebug:['正常采集','0x5A5A5A','0x123456','RX_MIX 数据'][r.adcPattern],dacdebug:['正常播放','−6 dB 正弦','−60 dB 正弦','全零数据'][r.dacPattern],tx:r.txEnabled&&r.sdoEnabled?'TX / SDO ENABLED':'TX / SDO OFF',rx:r.rxEnabled?'RX ENABLED':'RX OFF'})[n[0]]??n[6];}
  function render(c,selected='pga',ui={focus:'all',zoom:1}){if(ui.focus&&ui.focus!=='all')return renderFocused(c,selected,{...ui,detail:'professional'});const g=graph(c),focus=ui.focus||'all';let s='<svg id="routingSVG" viewBox="0 0 '+W+' '+H+'" role="group" aria-label="AC10x 完整音频信号路径总图" style="width:'+(ui.zoom*100)+'%">';
    s+='<defs>'+[['record','#237f70'],['play','#a96f2c'],['monitor','#7862ae'],['loopback','#396fa3'],['debug','#7864b5'],['muted','#87959d']].map(([id,color])=>'<marker id="route-arrow-'+id+'" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 1L9 5L0 9Z" fill="var(--signal-'+id+','+color+')"/></marker>').join('')+'</defs>';
    s+='<rect class="graph-region" x="406" y="214" width="1132" height="128" rx="12"/><text class="graph-region-label" x="422" y="231">ADC / RECORD CHANNEL</text><rect class="graph-region" x="846" y="740" width="996" height="128" rx="12"/><text class="graph-region-label" x="862" y="858">DAC / PLAYBACK CHANNEL</text>';
    s+='<text class="graph-section" x="40" y="48">01  输入与录音处理</text><text class="graph-section" x="1768" y="48">02  TX 混音与串行输出</text><text class="graph-section" x="40" y="716">03  RX 混音、播放与模拟输出</text>';
    const recordChain=['bias-mic','mic-pga','pga-adc','adc-mux','dmic-data','dmic-clock','dmic-mux','mux-decim','decim-hpf','hpf-agc','agc-adcvol','adcvol-rec'];
    const playbackTail=['dacmix-eq','eq-dacvol','dacvol-play','play-interp','interp-dac','dac-lineamp','lineamp-output'];
    const matches=e=>focus==='all'||focus==='record'&&e.group==='record'||focus==='play'&&e.group==='play'||focus==='monitor'&&[...recordChain,...playbackTail,'rec-dacmix'].includes(e.id)||focus==='loopback'&&[...playbackTail,'play-txl','rxm-txr','rxm-adc-test','adc-test-selector','sdin-map','rxl-mix','rxr-mix','rxmix-rxm','rxm-dacmix','txl-map','txr-map','map-sdout'].includes(e.id);
    const near=new Set([selected]);if(ui.associate)for(const e of g.edges)if(e.from===selected||e.to===selected){near.add(e.from);near.add(e.to);}
    const segments=[...(g.visualWires||[]),...g.shared,...g.edges].sort((a,b)=>Number(a.on)-Number(b.on));
    for(const e of segments){const related=ui.associate&&(e.shared?['rxm','txr','adcdebug'].includes(selected):e.from===selected||e.to===selected),cls='graph-edge '+e.group+' '+(e.on?'enabled':'disabled')+(e.kind==='control'?' control':'')+(matches(e)||e.shared&&focus==='loopback'?'':' dimmed')+(related?' related':'');s+='<g class="'+cls+'" '+(e.shared?'data-wire':'data-edge')+'="'+e.id+'" data-enabled="'+e.on+'" data-from="'+e.from+'" data-to="'+e.to+'"><title>'+esc(e.label||e.from+' → '+e.to)+' · '+(e.on?'已启用':'未启用')+'</title>'+edgePaths(e,e.on?e.group:'muted','route-arrow-',ui)+(e.shared?(e.junctions||[[616,584],[616,802]]).map(([x,y],i)=>'<circle '+(e.id==='rxm-shared'&&i===0?'id="rxm-fork" ':'')+'class="routing-junction" cx="'+x+'" cy="'+y+'" r="3.5"/>').join(''):'')+'</g>';}
    for(const [id,x,y,label,on]of g.taps){s+='<g role="button" tabindex="0" data-node="'+id+'" aria-label="'+label+' 数据节点" class="graph-tap '+(selected===id?'selected':'')+'"><circle cx="'+x+'" cy="'+y+'" r="5" class="'+(on?'active':'')+'"/><text x="'+x+'" y="'+(id==='rec'?y-15:y+37)+'" text-anchor="middle">'+label+'</text></g>';}
    for(const n of nodes){const[id,x,y,w,h,title,,kind]=n;let off=(id==='pga'||id==='adc'||id==='input')&&!g.state.analog||id==='dmic'&&!g.state.dmic||id==='hpf'&&!c.hpf.enabled||id==='agc'&&!c.agc.enabled||id==='eq'&&!c.eq.enabled||id==='lineamp'&&!c.routing.lineOut;
      const debugActive=id==='adcdebug'&&c.routing.adcPattern!==0||id==='dacdebug'&&c.routing.dacPattern!==0;
      s+='<g class="graph-node '+kind+(selected===id?' selected':'')+(ui.associate&&near.has(id)&&selected!==id?' related':'')+(off?' off':'')+(debugActive?' enabled-node':'')+'" role="button" tabindex="0" aria-label="'+title+' 模块" data-node="'+id+'" aria-pressed="'+(selected===id)+'"><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="8"/>'+(kind==='mix'?'<circle cx="'+(x+13)+'" cy="'+(y+13)+'" r="3" class="mixer-dot"/>':'')+'<text class="node-title" x="'+(x+w/2)+'" y="'+(y+h/2-4)+'" text-anchor="middle">'+esc(title)+'</text><text class="node-subtitle" x="'+(x+w/2)+'" y="'+(y+h/2+17)+'" text-anchor="middle">'+esc(id==='eq'&&ui.readback?(c.eq.enabled?'已启用 · 设备系数':'BYPASS'):id==='hpf'&&ui.readback&&ui.hpfKnown===false&&c.hpf.enabled?'频率未知':sublabel(n,c,g))+'</text></g>';}
    s+='<text class="graph-note" x="40" y="912">AMIC 与 DMIC 共用 MICP / MICN；DMIC 使用抽取滤波，绕过模拟 PGA / ΣΔ ADC。</text><text class="graph-note" x="40" y="940">REC → DAC 为监听；PLAY → TXL 为播放回采；RXM → TXR 为数字直通。交叉线无圆点不连接。</text><text class="graph-note" x="2136" y="940" text-anchor="end">'+esc(ui.sourceLabel||'参数草稿路径')+'</text>';
    if(c.routing.input==='dmic'&&c.clock.fs>24000)s+='<text class="graph-warning" x="40" y="516">当前 '+c.clock.fs/1000+' kHz 超出手册列出的 DMIC 8–24 kHz 范围</text>';
    return{html:s+'</svg>',count:g.edges.length,nodes:g.nodes.length+g.taps.length,width:W,height:H};
  }
  const focusLabels={record:'麦克风录音',play:'USB / I²S播放',monitor:'麦克风本地监听',loopback:'RX数字直通',recapture:'播放数据回采',duplex:'独立录音与播放',mixed:'USB与麦克风混合输出'};
  function focusedGraph(c,focus){
    if(!focusLabels[focus])throw new Error('未知链路视图');
    const g=graph(c),on=id=>Boolean(g.edges.find(e=>e.id===id)?.on);
    const recordIn=[...(g.state.dmic?['dmic-data','dmic-clock','dmic-mux']:['bias-mic','mic-pga','pga-adc','adc-mux']),'mux-decim','decim-hpf','hpf-agc','agc-adcvol','adcvol-rec'];
    const recordOut=['rec-txl','rec-txr','txl-map','txr-map','map-sdout'];
    const receive=['sdin-map','rxl-mix','rxr-mix','rxmix-rxm'];
    const digitalPlay=['rxm-dacmix','dacmix-eq','eq-dacvol','dacvol-play'];
    const analogPlay=['play-interp','interp-dac','dac-lineamp','lineamp-output'];
    const record=[...recordIn,...recordOut],play=[...receive,...digitalPlay,...analogPlay];
    const sets={record,play,monitor:[...recordIn,'rec-dacmix',...digitalPlay.filter(e=>e!=='rxm-dacmix'),...analogPlay],
      loopback:[...receive,'rxm-txr','txr-map','map-sdout'],
      recapture:[...receive,...digitalPlay,'play-txl','txl-map','map-sdout'],duplex:[...record,...play],mixed:[...recordIn,'rec-dacmix',...play]};
    const chosen=new Set(sets[focus]),edges=g.edges.filter(e=>chosen.has(e.id));
    const rec=on('map-sdout')&&(on('rec-txl')&&on('txl-map')||on('rec-txr')&&on('txr-map'));
    const playback=on('rxm-dacmix')&&on('lineamp-output'),monitor=on('rec-dacmix')&&on('lineamp-output');
    const enabled={record:rec,play:playback,monitor,loopback:on('rxm-txr')&&on('txr-map')&&on('map-sdout'),recapture:on('play-txl')&&on('txl-map')&&on('map-sdout'),duplex:rec&&playback,mixed:monitor&&on('rxm-dacmix')}[focus];
    return{...g,edges,enabled,label:focusLabels[focus]};
  }
  function renderFocused(c,selected=null,ui={}){
    const g=focusedGraph(c,ui.focus),compact=ui.detail!=='professional';
    const collapse=id=>compact?({source:g.state.dmic?'dmic':'adc',decim:g.state.dmic?'dmic':'adc',rec:'adcvol',rxmap:'rxmix',rxm:'rxmix',play:'dacvol',interp:'dac',lineamp:'output',txmap:'tx'}[id]||id):id;
    const merged=new Map();
    for(const edge of g.edges){
      if(edge.id==='dmic-clock'||compact&&edge.kind==='control')continue;
      const from=collapse(edge.from),to=collapse(edge.to);if(from===to)continue;
      const key=from+'|'+to+'|'+edge.group;
      if(merged.has(key)){const old=merged.get(key);old.on=old.on||edge.on;old.original.push(edge.id);}
      else merged.set(key,{...edge,from,to,original:[edge.id],label:''});
    }
    const edges=[...merged.values()],ids=[...new Set(edges.flatMap(e=>[e.from,e.to]))],degree=new Map(ids.map(id=>[id,0])),rank=new Map(ids.map(id=>[id,0]));
    for(const edge of edges)degree.set(edge.to,degree.get(edge.to)+1);
    const queue=ids.filter(id=>degree.get(id)===0);let visited=0;
    while(queue.length){const id=queue.shift();visited++;for(const edge of edges.filter(e=>e.from===id)){rank.set(edge.to,Math.max(rank.get(edge.to),rank.get(id)+1));degree.set(edge.to,degree.get(edge.to)-1);if(degree.get(edge.to)===0)queue.push(edge.to);}}
    if(visited!==ids.length)throw new Error('链路视图出现循环，停止绘制');
    const layers=[];for(const id of ids){const n=rank.get(id);(layers[n]||(layers[n]=[])).push(id);}
    const maxRows=Math.max(1,...layers.map(list=>list.length)),columns=6,pitch=194,w=148,h=68,stride=(maxRows-1)*104+h+90,width=1186,bands=Math.ceil(layers.length/columns),height=88+bands*stride+10,positions=new Map();
    layers.forEach((list,index)=>{const band=Math.floor(index/columns),direction=band%2?-1:1,column=direction===1?index%columns:columns-1-index%columns;
      list.forEach((id,row)=>positions.set(id,{x:34+column*pitch,y:88+band*stride+(maxRows-list.length)*52+row*104,band,direction,rank:index}));
    });
    const wrapGroups=[...new Set(edges.filter(e=>positions.get(e.from).band!==positions.get(e.to).band).map(e=>e.group))];
    const palette=[['record','#237f70'],['play','#a96f2c'],['monitor','#7862ae'],['loopback','#396fa3'],['debug','#7864b5'],['muted','#87959d']];
    let s='<svg id="routingSVG" class="focused-routing" data-focus-view="'+ui.focus+'" viewBox="0 0 '+width+' '+height+'" role="group" aria-label="'+g.label+'独立链路图" style="width:'+((ui.zoom||1)*100)+'%"><defs>'+palette.map(([id,color])=>'<marker id="focus-arrow-'+id+'" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 1L9 5L0 9Z" fill="'+color+'"/></marker>').join('')+'</defs>';
    s+='<text class="focus-title" x="34" y="30">'+esc(g.label)+' · '+(compact?'简图':'完整图')+'</text><text class="focus-subtitle" x="34" y="54">'+(g.enabled?'草稿通路已连通':'当前草稿未完整启用此链路，灰色线指出断点')+' · 箭头表示通路方向，非实测音频</text>';
    for(const edge of [...edges].sort((a,b)=>Number(a.on)-Number(b.on))){
      const a=positions.get(edge.from),b=positions.get(edge.to),sx=a.x+(a.direction===1?w:0),sy=a.y+h/2,tx=b.x+(b.direction===1?0:w),ty=b.y+h/2;
      if(a.band===b.band){const mid=(sx+tx)/2;edge.d='M'+sx+' '+sy+'H'+mid+'V'+ty+'H'+tx;}
      else{const lane=8+wrapGroups.indexOf(edge.group)*12,channelY=88+(a.band+1)*stride-45,sourceX=sx+a.direction*lane,targetX=tx-b.direction*lane;edge.d='M'+sx+' '+sy+'H'+sourceX+'V'+channelY+'H'+targetX+'V'+ty+'H'+tx;}
      s+='<g class="graph-edge '+edge.group+' '+(edge.on?'enabled':'disabled')+'" data-edge="'+edge.id+'" data-original-edges="'+edge.original.join(',')+'" data-enabled="'+edge.on+'" data-from="'+edge.from+'" data-to="'+edge.to+'"><title>'+esc(edge.from+' → '+edge.to)+' · '+(edge.on?'已启用':'未启用')+'</title>'+edgePaths(edge,edge.on?edge.group:'muted','focus-arrow-',ui)+'</g>';
    }
    const compactNames={input:'麦克风输入',pga:'输入增益',adc:'ADC转换',hpf:'高通HPF',agc:'自动增益',adcvol:'录音音量',tx:'数字音频输出',rx:'数字音频输入',rxmix:'RX混音',dacmix:'DAC混音',eq:'三段EQ',dacvol:'播放音量',dac:'DAC转换',output:'模拟输出'};
    for(const id of ids){const n=nodeMap[id],tap=g.taps.find(t=>t[0]===id),p=positions.get(id),title=compact?(compactNames[id]||n?.[5]||tap?.[3]):n?.[5]||tap?.[3],sub=id==='output'?(c.routing.lineOut?c.routing.lineGain+' dB · '+(c.routing.lineDifferential?'差分':'单端'):'Line Out关闭'):n?sublabel(n,c,g):'数字数据节点',kind=n?.[7]||'digital';
      const off=id==='hpf'&&!c.hpf.enabled||id==='agc'&&!c.agc.enabled||id==='eq'&&!c.eq.enabled||id==='adc'&&!c.adc.enabled||id==='dac'&&!c.dac.enabled||id==='rx'&&!c.routing.rxEnabled||id==='tx'&&!g.state.tx||id==='output'&&!c.routing.lineOut;
      s+='<g class="graph-node '+kind+(id===selected?' selected':'')+(off?' off':'')+'" role="button" tabindex="0" data-node="'+id+'" aria-pressed="'+(id===selected)+'" aria-label="'+esc(title)+' 模块"><rect x="'+p.x+'" y="'+p.y+'" width="'+w+'" height="'+h+'" rx="10"/><text class="node-title" x="'+(p.x+w/2)+'" y="'+(p.y+28)+'" text-anchor="middle">'+esc(title)+'</text><text class="node-subtitle" x="'+(p.x+w/2)+'" y="'+(p.y+49)+'" text-anchor="middle">'+esc(sub)+'</text></g>';
    }
    s+='<text class="graph-note" x="34" y="'+(height-16)+'">'+(c.dac.mute&&['play','monitor','duplex','mixed'].includes(ui.focus)?'DAC草稿当前静音；载入示例不会自动下发或发声。':'这里只改变查看范围；载入示例才改变草稿，设备写入仍需明确操作。')+'</text></svg>';
    return{html:s,count:edges.length,nodes:ids.length,width,height,focus:ui.focus};
  }
  const SIMPLE_IDS=['input','pga','adc','hpf','agc','adcvol','tx','rx','eq','dacvol','dac','output','clock','control'];
  function renderSimple(c,selected=null,ui={focus:'all',zoom:1}){
    if(ui.focus&&ui.focus!=='all')return renderFocused(c,selected,{...ui,detail:'simple'});
    const g=graph(c),r=c.routing,on=id=>g.edges.find(e=>e.id===id)?.on||false;
    const recToTX=(on('rec-txl')&&on('txl-map'))||(on('rec-txr')&&on('txr-map'));
    const rows=[
      ['input',35,224,150,'麦克风输入',r.input==='dmic'?'DMIC 数字输入':'MICP / MICN','record'],
      ['pga',215,224,140,'输入增益',g.state.dmic?'DMIC 旁路':c.pga+' dB · PGA','record'],
      ['adc',395,224,140,'ADC 转换',g.state.dmic?'DMIC 旁路':'模拟 → 数字','record'],
      ['hpf',575,224,140,'高通 HPF',c.hpf.enabled?c.hpf.freq+' Hz':'旁路','record'],
      ['agc',755,224,140,'自动增益',c.agc.enabled?c.agc.target+' dBFS · AGC':'旁路','record'],
      ['adcvol',935,224,140,'录音音量',c.adc.mute?'静音':c.adc.gain+' dB','record'],
      ['tx',1115,224,170,'数字音频输出',g.state.tx?'SDOUT · I²S / PCM':'SDOUT 关闭','record'],
      ['rx',35,483,180,'数字音频输入',r.rxEnabled?'SDIN · I²S / PCM':'SDIN 关闭','play'],
      ['eq',295,483,180,'三段 EQ',c.eq.enabled?c.eq.bands.filter(b=>b.enabled).length+' 段启用':'旁路','play'],
      ['dacvol',555,483,180,'播放音量',c.dac.mute?'静音':c.dac.gain+' dB','play'],
      ['dac',815,483,180,'DAC 转换','插值 · 数模转换 · LPF','play'],
      ['output',1075,483,210,'模拟输出',r.lineOut?r.lineGain+' dB · LOUTP / N':'Line Out 关闭','play'],
      ['clock',420,28,230,'时钟与接口',c.clock.fs/1000+' kHz · '+({I2S:'I²S',LJ:'左对齐',RJ:'右对齐',PCM:'PCM'}[c.clock.format]),'power'],
      ['control',730,28,250,'设备与寄存器','USB HID → I²C','power']
    ],map=Object.fromEntries(rows.map(n=>[n[0],n])),edges=[];
    const add=(id,from,to,enabled,group,label='')=>{const a=map[from],b=map[to];edges.push({id,from,to,on:enabled,group,label,d:'M'+(a[1]+a[3])+' '+(a[2]+43)+'H'+b[1],lx:(a[1]+a[3]+b[1])/2,ly:a[2]+30});};
    add('simple-input-pga','input','pga',g.state.rec&&g.state.analog,'record');add('simple-pga-adc','pga','adc',g.state.rec&&g.state.analog,'record');add('simple-adc-hpf','adc','hpf',g.state.rec&&g.state.analog,'record');add('simple-hpf-agc','hpf','agc',g.state.rec,'record');add('simple-agc-vol','agc','adcvol',g.state.rec,'record');add('simple-vol-tx','adcvol','tx',recToTX,'record');
    add('simple-rx-eq','rx','eq',on('rxm-dacmix'),'play');add('simple-eq-vol','eq','dacvol',g.state.play,'play');add('simple-vol-dac','dacvol','dac',g.state.play,'play');add('simple-dac-out','dac','output',on('lineamp-output'),'play');
    if(g.state.dmic)edges.push({id:'simple-dmic-bypass',from:'input',to:'hpf',on:g.state.rec,group:'record',label:'DMIC · 绕过模拟前端',d:'M185 267V197H645V224',lx:410,ly:187});
    if(on('rec-dacmix'))edges.push({id:'simple-monitor',from:'adcvol',to:'eq',on:true,group:'monitor',label:'录音监听',d:'M1005 310V371H385V483',lx:685,ly:361});
    const related=new Set([selected]);if(ui.associate)for(const e of edges)if(e.from===selected||e.to===selected){related.add(e.from);related.add(e.to);}
    let s='<svg id="routingSVG" class="simple-routing" viewBox="0 0 1320 660" role="group" aria-label="简图音频信号路径" style="width:'+(ui.zoom*100)+'%"><defs>';
    for(const [name,color]of [['record','#237f70'],['play','#a96f2c'],['monitor','#7862ae'],['muted','#87959d']])s+='<marker id="simple-arrow-'+name+'" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 1L9 5L0 9Z" fill="'+color+'"/></marker>';
    s+='</defs><rect class="simple-lane record-lane" x="18" y="135" width="1290" height="204" rx="18"/><rect class="simple-lane play-lane" x="18" y="394" width="1290" height="208" rx="18"/><text class="simple-lane-title record-label" x="36" y="173">01  采集 / 录音</text><text class="simple-lane-caption" x="1284" y="173" text-anchor="end">麦克风 → 数字音频</text><text class="simple-lane-title play-label" x="36" y="432">02  播放 / 输出</text><text class="simple-lane-caption" x="1284" y="432" text-anchor="end">数字音频 → 模拟输出</text>';
    for(const e of [...edges].sort((a,b)=>Number(a.on)-Number(b.on))){const dim=ui.focus&&ui.focus!=='all'&&ui.focus!==e.group;s+='<g class="graph-edge '+e.group+' '+(e.on?'enabled':'disabled')+(dim?' dimmed':'')+(ui.associate&&(e.from===selected||e.to===selected)?' related':'')+'" data-edge="'+e.id+'" data-enabled="'+e.on+'" data-from="'+e.from+'" data-to="'+e.to+'"><title>'+esc(e.label||e.from+' → '+e.to)+' · '+(e.on?'已启用':'未启用')+'</title>'+edgePaths(e,e.on?e.group:'muted','simple-arrow-',ui)+'</g>';}
    for(const [id,x,y,w,title,sub,kind]of rows)s+='<g class="graph-node '+kind+(id===selected?' selected':'')+(ui.associate&&related.has(id)&&id!==selected?' related':'')+'" role="button" tabindex="0" aria-label="'+title+' 模块" aria-pressed="'+(id===selected)+'" data-node="'+id+'"><rect x="'+x+'" y="'+y+'" width="'+w+'" height="86" rx="12"/><text class="node-title" x="'+(x+w/2)+'" y="'+(y+35)+'" text-anchor="middle">'+esc(title)+'</text><text class="node-subtitle" x="'+(x+w/2)+'" y="'+(y+61)+'" text-anchor="middle">'+esc(sub)+'</text></g>';
    const advanced=r.txL.play||r.txR.rx||r.adcPattern!==0||r.dacPattern!==0;
    s+='<text class="graph-note" x="35" y="642">'+(advanced?'高级回采 / 调试源已启用，可切换完整图查看明细。':'混音、通道映射和可选回环已收起；完整图保留全部路径。')+'</text><text class="graph-note" x="1284" y="642" text-anchor="end">参数草稿路径</text></svg>';
    return{html:s,count:edges.length,nodes:rows.length,width:1320,height:660};
  }
  const check=(path,label)=>'<label class="switch-label"><input type="checkbox" data-bind="'+path+'">'+label+'</label>';
  const range=(path,label,min,max,step,unit)=>'<label class="route-range">'+label+'<span data-value="'+path+'" data-unit="'+unit+'"></span><input aria-label="'+label+'" type="range" data-bind="'+path+'" min="'+min+'" max="'+max+'" step="'+step+'"></label>';
  const select=(path,label,options,numeric=false)=>'<label class="route-select">'+label+'<select aria-label="'+label+'" data-bind="'+path+'" '+(numeric?'data-kind="number"':'')+'>'+options.map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join('')+'</select></label>';
  const jump=(view,label)=>'<button class="btn" data-inspect-jump="'+view+'">'+label+' ↗</button>';
  function mixFields(name,a,b,labelA,labelB){const p='routing.'+name;return '<div class="mix-input">'+check(p+'.'+a,labelA)+check(p+'.'+a+'Half',labelA+' −6 dB')+'</div><div class="mix-input">'+check(p+'.'+b,labelB)+check(p+'.'+b+'Half',labelB+' −6 dB')+'</div>';}
  function inspector(id,c){const r=c.routing;let title='',desc='',controls='',ref='',note='修改后在本悬窗底部写入；只更新当前模块并核验读回。';
    switch(id){
      case 'bias':title='MIC BIAS';desc='给模拟麦克风提供偏置，和音频输入信号分开显示。';controls=check('routing.mbias','启用麦克风偏置');ref='PWR_CTRL2 · 0x02[2]';break;
      case 'input':case 'source':case 'dmic':case 'dmicport':title='输入选择 · AMIC / DMIC';desc='模拟 PGA / ΣΔ ADC 和 DMIC 数据在共享抽取滤波器前选择。DMIC 使用 MICP 输出时钟，MICN 输入 PDM 数据。';controls=select('routing.input','录音输入',[['analog','模拟麦克风 · AMIC'],['dmic','数字麦克风 · DMIC']])+check('adc.enabled','启用 ADC 数字通道');ref='ADC_DIG_CTRL · 0x19[7,0]';note=c.clock.fs>24000?'手册仅列出 DMIC 8–24 kHz 的时钟配置。当前高于该范围，图中分支显示不可用。':'DMIC 路径由 AC102 手册核对；不据此推定 AC101S 同样支持。';break;
      case 'pga':title='PGA · 模拟输入增益';desc='差分输入前置放大，只作用于模拟麦克风路径；DMIC 绕过此模块。';controls=range('pga','PGA 增益',0,31,1,'dB');ref='ADC_ANA_CTRL1 · 0x20[7:3]';break;
      case 'adc':title='ΣΔ ADC';desc='模拟麦克风的 ΣΔ 调制器。DMIC 模式绕过模拟调制器并共用后续抽取滤波。';controls=check('adc.enabled','启用 ADC 数字通道')+jump('clock','配置采样率与时钟');ref='ADC_DIG_CTRL · 0x19[0]';break;
      case 'decim':title='DECIM · 抽取滤波';desc='将 ADC 调制器或 DMIC 的过采样数据转换为录音采样率，再进入 HPF、AGC 和数字音量。';controls=jump('clock','查看采样率');ref='手册 Fig 9-24';break;
      case 'hpf':title='HPF · 录音高通';desc='位于抽取滤波之后、AGC 之前。关闭时旁路通过，不切断录音路径。';controls=check('hpf.enabled','启用高通')+range('hpf.freq','HPF 截止频率',.1,1000,.1,'Hz')+jump('dynamics','编辑高通');ref='AGC_CTRL · 0x31[3]';note='器件 HPF 为一阶 IIR。下发系数时先旁路，写后读回核验，再恢复使能。';break;
      case 'agc':title='AGC · 录音自动增益';desc='位于 HPF 之后、ADC DVC 之前。增益控制目标不改变混音器连接关系。';controls=check('agc.enabled','启用 AGC')+range('agc.target','AGC 目标电平',-30,-1,1,'dBFS')+jump('dynamics','编辑 AGC');ref='AGC_CTRL · 0x31[4]';break;
      case 'adcvol':title='ADC DVC';desc='AGC 后的数字音量；输出 RECD_DAT，可送往 TX 左右混音器，也可送 DAC 进行监听。';controls=check('adc.mute','ADC 数字静音')+range('adc.gain','ADC 数字增益',-64,63,.5,'dB');ref='ADC_DVC · 0x1A';break;
      case 'dacvol':title='DAC DVC';desc='三段 EQ 之后、插值滤波之前的数字音量。其输出 PLAY_DAT 可回采到 TX_MIXL。';controls=check('dac.mute','DAC 数字静音')+range('dac.gain','DAC 数字增益',-64,63,.5,'dB');ref='DAC_DVC · 0x1C';break;
      case 'rec':title='RECD_DAT · 录音数据';desc='ADC DVC 后的共享录音数据。可分别送往 TX_MIXL、TX_MIXR 和 DAC_MIX，三条支路独立开关。';controls=check('routing.txL.rec','送往 TX_MIXL')+check('routing.txR.rec','送往 TX_MIXR')+check('routing.dac.rec','送往 DAC_MIX · 监听');ref='0x13[0,2] · 0x1D[1]';break;
      case 'rxm':title='RXM · 接收混音输出';desc='RX_MIX 的输出，可送 DAC_MIX 播放、TX_MIXR 数字回环，或选作 ADC 调试数据源。';controls=check('routing.dac.rx','送往 DAC_MIX')+check('routing.txR.rx','送往 TX_MIXR')+select('routing.adcPattern','ADC 调试源',[[0,'正常'],[1,'0x5A5A5A'],[2,'0x123456'],[3,'RX_MIX 数据']],true);ref='0x1D[0] · 0x13[3] · 0x19[5:4]';break;
      case 'play':title='PLAY_DAT · 播放回采';desc='DAC DVC 后、插值滤波之前的播放数据，既继续送往 DAC，也可回采到 TX_MIXL。';controls=check('routing.txL.play','播放数据送往 TX_MIXL');ref='I2S_TX_MIX_SRC · 0x13[1]';break;
      case 'rxmix':title='RX_MIX';desc='接收侧 RXL / RXR 的两输入混音器。每路可独立启用，并分别选择 0 / −6 dB。';controls=mixFields('rx','left','right','RXL 输入','RXR 输入');ref='I2S_RX_MIX_SRC · 0x18';break;
      case 'dacmix':title='DAC_MIX · 录音监听';desc='把外部播放数据 RXM 与录音数据 RECD_DAT 混合后送往 EQ。监听开关控制 RECD_DAT → DAC_MIX 这条支路。';controls='<p id="monitorRouteState" class="route-state-note" role="status"></p>'+mixFields('dac','rx','rec','RXM · 外部播放','启用录音监听 · RECD_DAT');ref='DAC_MIX_SRC · 0x1D';break;
      case 'txl':title='TX_MIXL';desc='TX 左混音器可选择录音数据 RECD_DAT 和播放数据 PLAY_DAT。后者用于播放回采。';controls=mixFields('txL','rec','play','RECD_DAT · 录音','PLAY_DAT · 播放回采');ref='I2S_TX_MIX_SRC · 0x13[5:4,1:0]';break;
      case 'txr':title='TX_MIXR';desc='TX 右混音器可选择录音数据 RECD_DAT 和接收混音数据 RXM。后者用于数字接收直通。';controls=mixFields('txR','rec','rx','RECD_DAT · 录音','RXM · 数字回环');ref='I2S_TX_MIX_SRC · 0x13[7:6,3:2]';break;
      case 'rxmap':title='RX 通道映射';desc='串行接收的 CH1–4 映射到 RXL / RXR 或两个 dummy 通道。当前帧实际使用的时隙数仍由接口配置决定。';controls=r.rxMap.map((_,i)=>select('routing.rxMap.'+i,'RX CH'+(i+1)+' 映射',[[0,'RXL'],[1,'RXR'],[2,'RX3 · dummy'],[3,'RX4 · dummy']],true)).join('');ref='I2S_RX_CHMP_CTRL · 0x16';break;
      case 'txmap':title='TX 通道映射';desc='为每个串行发送通道选择 TXML 或 TXMR。图中左右混音输出同时展示，实际帧时隙数由接口配置决定。';controls=r.txMap.map((_,i)=>select('routing.txMap.'+i,'TX CH'+(i+1)+' 映射',[[0,'TXML'],[1,'TXMR']],true)).join('');ref='I2S_TX_CHMP_CTRL · 0x11';break;
      case 'rx':title='SDIN · I²S / PCM RX';desc='串行接收数据先经通道映射，再由 RX_MIX 选择 RXL / RXR。';controls=check('routing.rxEnabled','启用 I²S RX')+jump('clock','配置音频接口');ref='I2S_CTRL · 0x07[1]';break;
      case 'tx':title='SDOUT · I²S / PCM TX';desc='TX 左右混音数据经通道映射送往 SDOUT。TX 和 SDO 管脚驱动分别控制。';controls=check('routing.txEnabled','启用 I²S TX')+check('routing.sdoEnabled','启用 SDO 输出')+jump('clock','配置音频接口');ref='I2S_CTRL · 0x07[4,2]';break;
      case 'eq':title='三段 EQ';desc='位于 DAC_MIX 之后、DAC DVC 之前。关闭时旁路，继续传送播放数据。';controls=check('eq.enabled','启用均衡器')+jump('eq','编辑三段 EQ');ref='EQ_CTRL · 0x4F[0]';break;
      case 'interp':title='INTP · 插值滤波';desc='将 DAC DVC 输出的音频数据插值至 DAC 调制器的工作速率。PLAY_DAT 在此模块前分支。';controls=jump('clock','查看采样率与时钟');ref='手册 Fig 9-24';break;
      case 'dac':title='ΣΔ DAC / 模拟 LPF';desc='把插值滤波后的数字播放数据转换成模拟信号，经模拟低通后送 Line Out 放大器。';controls=check('dac.enabled','启用 DAC 数字通道');ref='DAC_DIG_CTRL · 0x1B[0]';break;
      case 'lineamp':case 'output':title='LINE OUT · 模拟输出';desc='DAC 模拟输出经过 Line Out 放大器。当前草稿为'+(r.lineDifferential?'差分':'单端')+'模式；导入设备标量后与读回一致。音量写入保留设备输出模式。';controls=check('routing.lineOut','启用 Line Out')+range('routing.lineGain','Line Out 增益',r.lineDifferential?-45:-39,0,3,'dB');ref='DAC_ANA_CTRL2 · 0x26[5,3:0]';break;
      case 'adcdebug':title='ADC 调试数据源';desc='可选择正常录音数据、两种固定 24 bit 图样或 RX_MIX 数据。图中列出逻辑选择关系，不推测内部精确插入位置。';controls=select('routing.adcPattern','ADC 调试源',[[0,'正常录音'],[1,'0x5A5A5A'],[2,'0x123456'],[3,'RX_MIX 数据']],true);ref='ADC_DIG_CTRL · 0x19[5:4]';break;
      case 'dacdebug':title='DAC 调试数据源';desc='可选择正常播放数据、−6 dB / −60 dB 正弦或全零。调试选择单独列出，不将其画成额外的物理音频接口。';controls=select('routing.dacPattern','DAC 调试源',[[0,'正常播放'],[1,'−6 dB 正弦'],[2,'−60 dB 正弦'],[3,'全零数据']],true);ref='DAC_DIG_CTRL · 0x1B[2:1]';break;
      case 'clock':title='时钟域';desc='MCLK 提供系统参考，BCLK / LRCK 定义串行音频位和帧时序。此处不是音频数据流。';controls=jump('clock','编辑时钟与接口');ref='时钟 / 串行接口';break;
      case 'control':title='TWI 控制接口';desc='SCL / SDA 用于寄存器配置，和 SDIN / SDOUT 的音频传输分开。连接、读回与通信设置在左侧悬窗完成；编辑后点击写入。';controls=jump('hardware','打开设备连接');ref='TWI · I²C';break;
      default:return null;
    }
    return{kind:nodeMap[id]?.[7]?.toUpperCase()||'SIGNAL',html:'<div class="routing-inspector"><div class="detail-identity"><h3>'+esc(title)+'</h3><p>'+esc(desc)+'</p></div><div class="route-fields">'+controls+'</div><div class="detail-reference"><div class="eyebrow">REGISTER / SOURCE</div><b>'+esc(ref)+'</b><p>'+esc(note)+'</p></div></div>'};
  }
  const api={defaults,normalize,equivalent,validate,lineGainDb,lineGainCode,generated,registers,graph,focusedGraph,renderFocused,render,renderSimple,SIMPLE_IDS,inspector,W,H};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AudioRouting=api;
})(typeof globalThis!=='undefined'?globalThis:this);


