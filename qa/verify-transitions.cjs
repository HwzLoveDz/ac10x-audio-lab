const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..');
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(fs.readFileSync(path.join(root,'AC10x-Audio-Lab.html'),'utf8'),{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.localStorage.setItem('ac10x-audio-lab-diagram-mode','professional');w.scrollTo=()=>{};w.URL.createObjectURL=()=> 'blob:qa';w.URL.revokeObjectURL=()=>{};}});
const w=dom.window,d=w.document,$=s=>d.querySelector(s);
function click(s){const e=$(s);assert.ok(e,s);if(e.click)e.click();else e.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));}
function input(bind,value){const e=$('[data-bind="'+bind+'"]');assert.ok(e,bind);if(e.type==='checkbox')e.checked=value;else e.value=String(value);e.dispatchEvent(new w.Event('input',{bubbles:true}));}
let tests=0;
try{
 for(const [node,bind,edge,values] of [
  ['bias','routing.mbias','bias-mic',[false,true,false]],
  ['dacmix','routing.dac.rec','rec-dacmix',[false,true,false]],
  ['txl','routing.txL.play','play-txl',[false,true,false]],
  ['txr','routing.txR.rx','rxm-txr',[false,true,false]],
  ['rxmix','routing.rx.right','rxr-mix',[false,true,false]],
  ['output','routing.lineOut','lineamp-output',[false,true,false]],
  ['adc','adc.enabled','mux-decim',[false,true,false]],
  ['rx','routing.rxEnabled','sdin-map',[false,true,false]],
  ['tx','routing.txEnabled','map-sdout',[false,true,false]],
  ['adcdebug','routing.adcPattern','adc-test-selector',[0,3,0]],
  ['dacdebug','routing.dacPattern','dac-test-selector',[0,1,0]],
 ]) {
  click('#resetConfig');click('[data-node="'+node+'"]');
  for(const v of values){input(bind,v);const e=$('[data-edge="'+edge+'"]'),on=!!v;assert.equal(e.dataset.enabled,String(on),bind);assert.equal(e.classList.contains('enabled'),on);assert.equal(!!e.querySelector('.edge-flow'),false);assert.equal(e.querySelector('.edge-line').getAttribute('marker-end').includes('muted'),!on);assert.match(e.querySelector('title').textContent,on?/已启用/:/未启用/);}
  ++tests;console.log('PASS actual setting off/on/off: '+bind);
 }
 click('#resetConfig');click('[data-node="clock"]');input('clock.fs',16000);click('[data-node="source"]');
 for(const v of ['analog','dmic','analog']){input('routing.input',v);for(const id of ['dmic-clock','dmic-data','dmic-mux'])assert.equal($('[data-edge="'+id+'"]').dataset.enabled,String(v==='dmic'));}
 ++tests;console.log('PASS AMIC/DMIC switches the real clock/data/mux branches at valid Fs');
 click('#resetConfig');click('[data-node="output"]');
 for(const v of [false,true,false]){input('routing.lineOut',v);assert.equal($('[data-edge="lineamp-output"]').dataset.enabled,String(v));}
 ++tests;console.log('PASS complete graph reflects actual Line Out off/on/off');
 assert.deepEqual(errors,[]);console.log(tests+' real DOM transition checks passed; no hardware I/O');
}finally{w.dispatchEvent(new w.Event('pagehide'));w.close();}
