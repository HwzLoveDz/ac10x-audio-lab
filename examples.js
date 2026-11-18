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
  function quickStart(config,{fixedAudio=false,lineDifferential=config.routing?.lineDifferential,inputMode='analog'}={}){
    const c=C.normalize(copy(config)),r=R.defaults();
    if(fixedAudio)c.clock={fs:48000,format:'I2S',bits:16,slot:32,slots:2,role:'slave'};
    if(!['analog','dmic'].includes(inputMode))throw Error('麦克风类型无效');
    Object.assign(r,{input:inputMode,mbias:true,rxEnabled:true,txEnabled:true,sdoEnabled:true,lineOut:true,lineGain:0,lineDifferential:Boolean(lineDifferential)});
    r.rx={left:true,right:true,leftHalf:true,rightHalf:true};
    r.dac={rx:true,rec:false,rxHalf:false,recHalf:false};
    r.txL={rec:true,play:false,recHalf:false,playHalf:false};
    r.txR={rec:true,rx:false,recHalf:false,rxHalf:false};
    c.routing=r;c.pga=12;c.adc={enabled:true,gain:0,mute:false};c.dac={enabled:true,gain:0,mute:false};
    c.eq=eq('voice',c.clock.fs);c.hpf={enabled:false,freq:80};
    c.agc={enabled:false,target:-18,threshold:-70,maxGain:12,attack:1,release:120,debounce:1.3,noiseDebounce:170.6667,noiseDetect:false};
    c.raw={};return c;
  }
  const quickExamples=[
    {id:'default',name:'默认固件 · USB 声卡',tag:'日常使用',note:'USB 播放与麦克风独立录音，人声清晰 EQ；恢复正常播放电平。',path:'USB → 人声清晰 → 扬声器；MIC → USB',effect:'DAC 0 dB · Line Out 0 dB · 监听关闭',presetId:'voice'},
    {id:'flat-playback',name:'纯净播放',tag:'播放',note:'EQ 真正旁路，保留原始音色；关闭芯片麦克风采集。',path:'USB → EQ 旁路 → 扬声器',effect:'正常播放电平 · 麦克风采集关闭',presetId:'voice'},
    {id:'warm-music',name:'温暖音乐',tag:'播放',note:'增加少量低频厚度，缓和高频；麦克风仍独立录音。',path:'USB → 温暖柔和 EQ → 扬声器',effect:'正常播放电平 · 不开录音监听',presetId:'warm'},
    {id:'record-only',name:'独立录音',tag:'录音',note:'所选麦克风经 80 Hz 高通送到 USB；AGC 关闭，扬声器静音。',path:'MIC → HPF 80 Hz → USB',effect:'DAC 与 Line Out 关闭 · 不会自动开始录音',presetId:'voice'},
    {id:'playback-loopback',name:'播放数字回采',tag:'数字排查',note:'USB 录音左路接处理后播放数据，右路接输入混音，便于比较；不采集咪头。',path:'USB → EQ → 扬声器；PLAY / RXM → USB',effect:'录音左路为处理后数据，右路为 EQ 前数据',presetId:'voice'},
    {id:'left-channel',name:'仅左声道播放',tag:'声道排查',note:'只把电脑的左声道送到扬声器；用于排查声道选择和接线。',path:'USB 左声道 → 人声清晰 → 扬声器',effect:'右播放声道不混入 · 麦克风独立录音',presetId:'voice'},
    {id:'right-channel',name:'仅右声道播放',tag:'声道排查',note:'只把电脑的右声道送到扬声器；用于排查声道选择和接线。',path:'USB 右声道 → 人声清晰 → 扬声器',effect:'左播放声道不混入 · 麦克风独立录音',presetId:'voice'},
    {id:'aec-call',name:'AEC 免提通话',tag:'回声消除',note:'使用所选麦克风和播放参考做回声消除，保留人声清晰播放。',path:'USB → EQ → 扬声器；MIC + PLAY → AEC → USB',effect:'16 kHz 语音处理 · USB 48 kHz · 单声道录音复制到左右路',presetId:'voice',requiresAEC:true},
    {id:'mute',name:'静音待机',tag:'暂停音频',note:'关闭芯片录放和模拟输出；USB 控制保持可用，可再写入任一方案。',path:'播放关闭 · 录音关闭 · USB 控制保留',effect:'不休眠 MCU、不刷固件、不改电脑音量',presetId:'voice'}
  ];
  function quickExample(id,config,options={}){
    const meta=quickExamples.find(x=>x.id===id);if(!meta)throw new Error('未知 Quick Start 方案');
    const c=quickStart(config,options),r=c.routing;
    if(id==='aec-call'){r.txL={rec:false,play:true,recHalf:false,playHalf:false};r.txR={rec:true,rx:false,recHalf:false,rxHalf:false};}
    if(id==='warm-music')c.eq=eq('warm',c.clock.fs);
    // Real S31 capture requires the record digital channel even for PLAY/RXM sources.
    if(['flat-playback','mute'].includes(id))c.adc.enabled=false;
    if(['flat-playback','playback-loopback','mute'].includes(id)){c.adc.mute=true;r.mbias=false;}
    if(id==='flat-playback'){c.eq.enabled=false;r.txEnabled=false;r.sdoEnabled=false;}
    if(id==='record-only'){c.dac.enabled=false;c.dac.mute=true;r.lineOut=false;r.rxEnabled=false;c.eq.enabled=false;c.hpf.enabled=true;c.hpf.freq=80;}
    if(id==='playback-loopback'){r.txL={rec:false,play:true,recHalf:false,playHalf:false};r.txR={rec:false,rx:true,recHalf:false,rxHalf:false};}
    if(id==='left-channel'||id==='right-channel')r.rx={left:id==='left-channel',right:id==='right-channel',leftHalf:false,rightHalf:false};
    if(id==='mute'){c.dac.enabled=false;c.dac.mute=true;r.lineOut=false;r.rxEnabled=false;r.txEnabled=false;r.sdoEnabled=false;c.eq.enabled=false;}
    return c;
  }
  const api={eqPresets,eq,quickStart,defaultFirmware:quickStart,quickExamples,quickExample};if(common)module.exports=api;else root.AudioExamples=api;
})(typeof globalThis!=='undefined'?globalThis:this);
