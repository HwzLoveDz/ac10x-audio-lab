const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(fs.readFileSync(path.join(root,'AC10x-Audio-Lab.html'),'utf8'),{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.localStorage.setItem('ac10x-audio-lab-diagram-mode','professional');w.scrollTo=()=>{};w.URL.createObjectURL=()=> 'blob:qa';w.URL.revokeObjectURL=()=>{};}});
const w=dom.window,d=w.document,$=s=>d.querySelector(s),config=()=>w.AudioLab.getConfig();
const click=s=>{const e=$(s);assert.ok(e,s);if(e.click)e.click();else e.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));};
const set=(s,value)=>{const e=$(s);assert.ok(e,s);e.checked=value;e.dispatchEvent(new w.Event('input',{bubbles:true}));};
try{
 const before=JSON.stringify(config()),context=JSON.stringify(w.AudioLab.getContext()),panelHidden=$('#settingsWindow').hidden;
 assert.equal(JSON.stringify(config()),before);assert.equal(JSON.stringify(w.AudioLab.getContext()),context);assert.equal($('#settingsWindow').hidden,panelHidden);
 w.AudioLab.openNode('dacmix');assert.equal(d.body.dataset.selectedNode,'dacmix');assert.equal($('#settingsWindow').hidden,false);assert.match($('#monitorRouteState').textContent,/监听未启用/);assert.equal($('[data-edge="rec-dacmix"]').dataset.enabled,'false');
 console.log('PASS monitor range only filters the graph; its actual disabled REC switch remains explicitly reachable');
 set('#nodeInspector [data-bind="routing.dac.rec"]',true);
 assert.equal(config().routing.dac.rec,true);assert.equal($('[data-edge="rec-dacmix"]').dataset.enabled,'true');assert.equal($('[data-edge="rec-dacmix"] .edge-flow'),null);assert.equal(d.body.dataset.graphSource,'draft');assert.equal($('#monitorRouteState').dataset.enabled,'true');
 const expected=JSON.parse(before);expected.routing.dac.rec=true;assert.equal(JSON.stringify(config()),JSON.stringify(expected));
 console.log('PASS enabling the actual REC switch lights only its configured branch and updates both statuses');
 assert.equal(config().routing.dac.rec,true);
 assert.equal(config().routing.dac.rec,true);
 console.log('PASS viewing buttons do not silently toggle route or send hardware configuration');
 w.AudioLab.openNode('dacmix');set('#nodeInspector [data-bind="routing.dac.rec"]',false);assert.equal($('[data-edge="rec-dacmix"]').dataset.enabled,'false');assert.equal($('[data-edge="rec-dacmix"] .edge-flow'),null);assert.match($('#monitorRouteState').textContent,/未启用/);
 console.log('PASS disabling REC restores the gray/non-flowing route and disabled status');
 set('#nodeInspector [data-bind="routing.dac.rec"]',true);w.AudioLab.openNode('adc');set('[data-bind="adc.enabled"]',false);w.AudioLab.openNode('dacmix');assert.match($('#monitorRouteState').textContent,/ADC 数字通道关闭/);assert.equal($('[data-edge="rec-dacmix"]').dataset.enabled,'false');
 console.log('PASS selected monitor with ADC disabled reports the real upstream reason');
 const entry='AC10x-Audio-Lab-v'+w.AudioDebug.VERSION+'.html';assert.equal(fs.readFileSync(path.join(root,entry),'utf8'),fs.readFileSync(path.join(root,'AC10x-Audio-Lab.html'),'utf8'));
 assert.deepEqual(errors,[]);console.log('PASS current version entry matches the current bundle');
 console.log('6 monitor-entry checks passed; synthetic DOM, no physical I/O');
}finally{w.dispatchEvent(new w.Event('pagehide'));w.close();}

