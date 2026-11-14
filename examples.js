/* Local examples. These functions change a cloned draft only, never hardware. */
(function(root){
  'use strict';
  const common=typeof module!=='undefined'&&module.exports;
  const R=common?require('./routing.js'):root.AudioRouting,C=common?require('./codec.js'):root.AudioCodec;
  const copy=x=>JSON.parse(JSON.stringify(x));
  const band=(type,freq,gain=0,q=.707)=>({enabled:true,type,freq,gain,q});
  const eqPresets=[
    {id:'flat',name:'平直基准',group:'基准与排查',note:'三段单位响应，便于与设备原始声音比较。',preGain:0,bands:[band('peaking',200,0,1),band('peaking',1000,0,1),band('peaking',8000,0,1)]},
    {id:'voice',name:'人声清晰',group:'人声',note:'减轻低频浑浊，突出2.5kHz附近的咬字。',preGain:-4,bands:[band('lowshelf',180,-3),band('peaking',2500,3,1),band('highshelf',8000,1.5)]},
    {id:'speech',name:'语音通话',group:'人声',note:'低切和带宽收窄，聚焦通话频段；不等同于完整电话编解码器。',preGain:-3,bands:[band('highpass',120),band('peaking',1800,2,.85),band('lowpass',3600)]},
    {id:'podcast',name:'播客厚暖',group:'人声',note:'少量低频厚度，削减350Hz附近的闷感。',preGain:-3,bands:[band('lowshelf',160,2),band('peaking',350,-2,1),band('highshelf',5000,1)]},
    {id:'presence',name:'人声靠前',group:'人声',note:'收一点低中频，提升2.4kHz存在感。',preGain:-4,bands:[band('peaking',300,-2,1),band('peaking',2400,3,.9),band('highshelf',8500,.5)]},
    {id:'deess',name:'齿音抑制',group:'人声',note:'固定衰减6.5kHz附近；这是静态EQ，不是动态去齿音器。',preGain:-1,bands:[band('lowshelf',150,-1),band('peaking',6500,-4,1.8),band('highshelf',10000,-1)]},
    {id:'bass',name:'低频增强',group:'音乐与音色',note:'抬升低频，轻收低中频，保留输出余量。',preGain:-5,bands:[band('lowshelf',110,4),band('peaking',700,-1.5,1),band('highshelf',6500,.5)]},
    {id:'warm',name:'温暖柔和',group:'音乐与音色',note:'增加低频厚度，缓和高频和上中频。',preGain:-3.5,bands:[band('lowshelf',180,2.5),band('peaking',2500,-1,.9),band('highshelf',7000,-2)]},
    {id:'bright',name:'清亮通透',group:'音乐与音色',note:'削减低频堆积，提升高频亮度。',preGain:-4,bands:[band('lowshelf',160,-2),band('peaking',2800,1,1),band('highshelf',6000,3)]},
    {id:'soft',name:'柔化刺耳',group:'音乐与音色',note:'降低上中频和高频，适合比较刺耳感的来源。',preGain:-2,bands:[band('lowshelf',180,1),band('peaking',2500,-2,1),band('highshelf',4500,-3)]},
    {id:'vshape',name:'流行V形',group:'音乐与音色',note:'增强两端并收一点中频；前级衰减抵消提升后的峰值。',preGain:-6,bands:[band('lowshelf',110,3),band('peaking',800,-2,1),band('highshelf',7000,2.5)]},
    {id:'guitar',name:'乐器细节',group:'音乐与音色',note:'去掉极低频，减轻300Hz堆积并增加拨弦细节。',preGain:-3,bands:[band('highpass',70),band('peaking',300,-2,1),band('highshelf',4500,2)]},
    {id:'rumble',name:'低频降噪',group:'基准与排查',note:'高通和低架组合抑制低频；不是自适应噪声消除。',preGain:-2,bands:[band('highpass',100),band('lowshelf',250,-2),band('peaking',2200,1,1)]},
    {id:'boxy',name:'去闷去箱声',group:'基准与排查',note:'削减300Hz与950Hz附近，比较箱声和闷感。',preGain:-2.5,bands:[band('peaking',300,-4,1),band('peaking',950,-2,1),band('highshelf',5000,1.5)]},
    {id:'small-speaker',name:'小音箱起点',group:'基准与排查',note:'减少超低频负担，少量补偿低中频；仍需按实测调整。',preGain:-3,bands:[band('highpass',130),band('peaking',220,2,.9),band('highshelf',6000,-1.5)]},
    {id:'night',name:'夜间柔听',group:'音乐与音色',note:'减少两端刺激，保留中频清晰；不包含压缩或响度自动控制。',preGain:-2.5,bands:[band('lowshelf',150,-2),band('peaking',1800,1.5,.9),band('highshelf',6000,-3)]}
  ];
  function eq(id,fs){
    const p=eqPresets.find(x=>x.id===id);if(!p)throw new Error('未知 EQ 预设');if(!C.FS.includes(fs))throw new Error('不支持此采样率');
    return{enabled:true,preGain:p.preGain,bands:p.bands.map(b=>({...b,freq:Math.min(b.freq,Math.floor(fs*.4))}))};
  }
  function quickStart(config,{fixedAudio=false,lineDifferential=config.routing?.lineDifferential}={}){
    const c=C.normalize(copy(config)),r=R.defaults();
    if(fixedAudio)c.clock={fs:48000,format:'I2S',bits:16,slot:32,slots:2,role:'slave'};
    Object.assign(r,{input:'analog',mbias:true,rxEnabled:true,txEnabled:true,sdoEnabled:true,lineOut:true,lineGain:-18,lineDifferential:Boolean(lineDifferential)});
    r.rx={left:true,right:true,leftHalf:true,rightHalf:true};
    r.dac={rx:true,rec:false,rxHalf:false,recHalf:false};
    r.txL={rec:true,play:false,recHalf:false,playHalf:false};
    r.txR={rec:true,rx:false,recHalf:false,rxHalf:false};
    c.routing=r;c.pga=12;c.adc={enabled:true,gain:0,mute:false};c.dac={enabled:true,gain:-30,mute:false};
    c.eq=eq('flat',c.clock.fs);c.eq.enabled=false;c.hpf={enabled:false,freq:80};
    c.agc={enabled:false,target:-18,threshold:-70,maxGain:12,attack:1,release:120,debounce:1.3,noiseDebounce:170.6667,noiseDetect:false};
    c.raw={};return c;
  }
  const api={eqPresets,eq,quickStart};if(common)module.exports=api;else root.AudioExamples=api;
})(typeof globalThis!=='undefined'?globalThis:this);
