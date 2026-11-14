'use strict';
const assert=require('node:assert/strict'),R=require('../routing.js'),{make,copy}=require('./verify-properties.cjs'),{FakeHID,config}=require('./fake-hid.cjs');
let checks=0;const pass=n=>{checks++;console.log('PASS '+n);};
function segments(d){const parts=[...d.matchAll(/([MHV])([^MHV]+)/g)],out=[];let x=0,y=0;for(const [,cmd,arg]of parts){const n=arg.trim().split(/[ ,]+/).map(Number);if(cmd==='M'){[x,y]=n;continue;}const nx=cmd==='H'?n[0]:x,ny=cmd==='V'?n[0]:y;out.push([x,y,nx,ny]);x=nx;y=ny;}return out;}
(async()=>{
 const g=R.graph(config()),nodes=g.nodes;
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i],b=nodes[j];assert.ok(a[1]+a[3]<=b[1]||b[1]+b[3]<=a[1]||a[2]+a[4]<=b[2]||b[2]+b[4]<=a[2],a[0]+' overlaps '+b[0]);}
 pass('all full-graph node rectangles are disjoint with consistent main-lane dimensions and alignment');
 for(const ids of [['input','pga','adc','source','decim','hpf','agc','adcvol'],['rx','rxmap','rxmix','dacmix','eq','dacvol','interp','dac','lineamp','output']]){const lane=ids.map(id=>nodes.find(n=>n[0]===id));assert.equal(new Set(lane.map(n=>n[2])).size,1);assert.equal(new Set(lane.map(n=>n[3]+'x'+n[4])).size,1);for(let i=1;i<lane.length;i++)assert.ok(lane[i][1]-lane[i-1][1]>=164);}
 for(const e of [...g.edges,...g.shared])for(const [x,y,nx,ny]of segments(e.d))for(const n of nodes){if([e.from,e.to].includes(n[0]))continue;const inside=x===nx?x>n[1]+1&&x<n[1]+n[3]-1&&Math.max(y,ny)>n[2]+1&&Math.min(y,ny)<n[2]+n[4]-1:y>n[2]+1&&y<n[2]+n[4]-1&&Math.max(x,nx)>n[1]+1&&Math.min(x,nx)<n[1]+n[3]-1;assert.ok(!inside,e.id+' crosses '+n[0]);}
 pass('orthogonal signal paths avoid unrelated node interiors, including optional monitor and debug branches');
 const device=new FakeHID(),x=make({device});try{
  await x.flush();await x.w.AudioHardwareUI.connect();x.A.openNode('eq');const original=copy(x.A.getConfig()),context=copy(x.A.getContext()),camera=copy(x.A.getViewport()),svg=x.$('#routingSVG'),reports=device.sent.length;
  assert.equal(x.d.documentElement.dataset.theme,'light');x.$('#themeSwitch').click();await x.flush();assert.equal(x.d.documentElement.dataset.theme,'dark');assert.equal(x.$('#themeSwitch').getAttribute('aria-pressed'),'true');assert.equal(x.w.localStorage.getItem('ac10x-audio-lab-theme'),'dark');
  assert.deepEqual(copy(x.A.getConfig()),original);assert.deepEqual(copy(x.A.getContext()),context);assert.deepEqual(copy(x.A.getViewport()),camera);assert.equal(x.$('#routingSVG'),svg);assert.equal(device.sent.length,reports);
  pass('theme toggles retain connection, configuration, selected module, graph identity and camera with zero extra reports');
  x.w.AudioI18n.setLanguage('en');await x.flush();assert.equal(x.$('#themeSwitch').getAttribute('aria-label'),'Dark theme');assert.equal(x.d.documentElement.dataset.theme,'dark');x.$('#themeSwitch').focus();x.$('#themeSwitch').click();await x.flush();assert.equal(x.w.localStorage.getItem('ac10x-audio-lab-theme'),'light');assert.equal(x.d.activeElement,x.$('#themeSwitch'));x.w.AudioI18n.setLanguage('zh-CN');await x.flush();assert.equal(x.$('#themeSwitch').getAttribute('aria-label'),'暗色主题');assert.equal(device.sent.length,reports);assert.equal(x.d.querySelectorAll('#routingSVG').length,1);
  pass('theme state, bilingual accessible toggle and visible focus stay consistent without changing device state');
 }finally{x.close();}
 console.log(checks+' layout/theme checks passed; no real I/O');
})().catch(e=>{console.error(e);process.exitCode=1;});
