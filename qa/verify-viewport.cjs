const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Camera,svgPoint}=require('../viewport.js'),R=require('../routing.js'),E=require('../examples.js'),{config,FakeHID,memory}=require('./fake-hid.cjs'),{JSDOM,VirtualConsole}=require('jsdom');
let n=0;const pass=name=>{n++;console.log('PASS '+name);},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
for(const [vw,vh]of [[1920,900],[1366,600],[1024,450],[640,400],[375,250],[240,120]])for(const mode of ['full'])for(const view of [{id:'all'}]){const graph=R.render(config(),null,{focus:view.id,zoom:1}),c=new Camera();c.resize(vw,vh);c.content(graph.width,graph.height,mode+view.id);const s=c.snapshot();assert.ok(s.x>=-1e-7&&s.y>=-1e-7);assert.ok(s.x+s.scale*s.contentWidth<=vw+1e-7);assert.ok(s.y+s.scale*s.contentHeight<=vh+1e-7);near(s.x+s.scale*s.contentWidth/2,vw/2);near(s.y+s.scale*s.contentHeight/2,vh/2);}
pass('all eight diagram views fit inside six viewport sizes in both depths, including narrow/short windows');
function bounded(position,viewport,extent){return Math.min(viewport/2,Math.max(viewport/2-extent,position));}
function within(c){const s=c.snapshot();near(s.x,bounded(s.x,s.width,s.contentWidth*s.scale));near(s.y,bounded(s.y,s.height,s.contentHeight*s.scale));}
{const c=new Camera();c.resize(950,540);c.content(1560,850,'all');for(let i=0;i<150;i++){const px=50+(i*173)%850,py=20+(i*97)%500,wx=(px-c.x)/c.scale,wy=(py-c.y)/c.scale,next=Math.min(4,Math.max(.05,c.scale*(i%3?1.15:.6)));c.zoom(next,px,py);near(c.x,bounded(px-wx*next,c.width,c.contentWidth*next));near(c.y,bounded(py-wy*next,c.height,c.contentHeight*next));within(c);}assert.ok(c.scale>=.05&&c.scale<=4);}
pass('cursor-anchored zoom is preserved until an edge or corner-at-center bound is reached');
{const c=new Camera();c.resize(1000,600);c.content(1320,660,'all');c.zoom(1.8);c.pan(400,-300);const wx=(500-c.x)/c.scale,wy=(300-c.y)/c.scale;c.resize(420,800);near(c.x,bounded(210-wx*c.scale,420,c.contentWidth*c.scale));near(c.y,bounded(400-wy*c.scale,800,c.contentHeight*c.scale));const a=c.snapshot();c.content(1320,660,'all');assert.deepEqual(c.snapshot(),a);c.content(1020,400,'record');assert.equal(c.autoFit,true);c.pan(300,100);c.fit();near(c.x+c.contentWidth*c.scale/2,c.width/2);}
pass('redraw preserves manual view and resize preserves its center within content edges');
{const c=new Camera();c.resize(800,500);c.content(1400,900,'all');c.zoom(2);for(const [dx,dy,x,y]of [[1e6,1e6,400,250],[-1e6,1e6,-2400,250],[1e6,-1e6,400,-1550],[-1e6,-1e6,-2400,-1550]]){c.pan(dx,dy);near(c.x,x);near(c.y,y);within(c);}c.pan(1e6,1e6);c.pan(-10,-15);near(c.x,390);near(c.y,235);}
pass('all four graph corners stop exactly at viewport center and allow immediate reverse dragging');
{const c=new Camera();c.resize(800,500);c.content(400,900,'mixed');c.zoom(1);c.pan(1e6,-1e6);near(c.x,400);near(c.y,-650);c.zoom(.25);c.pan(-1e6,1e6);near(c.x,300);near(c.y,250);}
pass('small and large graphs both pan until each chosen corner reaches the viewport center');
{const c=new Camera();c.resize(900,600);c.content(1600,1000,'all');c.zoom(3);c.pan(-1e6,-1e6);c.zoom(.1,0,0);within(c);c.zoom(4,900,600);within(c);c.resize(1600,1000);within(c);c.content(200,150,'all');within(c);c.pan(NaN,2);within(c);}
pass('zooming out, resizing and content shrink reapply bounds rather than leaving the camera outside the graph');
{const rect={left:20,top:40,width:600,height:300},p=svgPoint(rect,'0 0 600 220',120,180);near(p.x,100);near(p.y,100);assert.equal(svgPoint({...rect,width:0},'0 0 600 220',0,0),null);}
pass('EQ pointer coordinates account for SVG aspect-ratio letterboxing and zero-size panels');
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));const device=new FakeHID({bytes:10});device.vendorId=0x303a;device.productId=0x4004;
const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../AC10x-Audio-Lab.html'),'utf8'),{url:'https://qa.invalid/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.scrollTo=()=>{};Object.defineProperty(w.navigator,'hid',{value:{requestDevice:async()=>[device],addEventListener(){},removeEventListener(){}}});}});
const w=dom.window,$=s=>w.document.querySelector(s),area=$('#canvasScroll');let capture=null;
Object.defineProperties(area,{clientWidth:{get:()=>900},clientHeight:{get:()=>520},clientLeft:{get:()=>1},clientTop:{get:()=>1}});area.getBoundingClientRect=()=>({left:30,top:100,width:902,height:522});area.setPointerCapture=id=>capture=id;area.hasPointerCapture=id=>capture===id;area.releasePointerCapture=()=>capture=null;
function pointer(target,type,button,x,y,id=8){const e=new w.MouseEvent(type,{bubbles:true,cancelable:true,button,buttons:type==='pointerup'?0:button===2?2:button===1?4:1,clientX:x,clientY:y});Object.defineProperty(e,'pointerId',{value:id});target.dispatchEvent(e);return e;}
const snap=()=>w.AudioLab.getViewport(),world=(s,x,y)=>({x:(x-s.x)/s.scale,y:(y-s.y)/s.scale});
try{
 w.dispatchEvent(new w.Event('resize'));for(let i=0;i<4;i++)$('#routeZoomIn').click();const draft=JSON.stringify(w.AudioLab.getConfig()),context=w.AudioLab.getContext();let a=snap();const node=$('#routingSVG [data-node]');
 pointer(node,'pointerdown',2,200,200);pointer(area,'pointermove',2,340,260);pointer(area,'pointerup',2,340,260);let b=snap();near(b.x-a.x,140);near(b.y-a.y,60);assert.equal(capture,null);assert.equal(area.classList.contains('panning'),false);assert.deepEqual(w.AudioLab.getContext(),context);assert.equal(JSON.stringify(w.AudioLab.getConfig()),draft);
 pass('right drag starts on a graph node and pans without selecting or editing that node');
 const menu=new w.MouseEvent('contextmenu',{bubbles:true,cancelable:true});node.dispatchEvent(menu);assert.equal(menu.defaultPrevented,true);node.dispatchEvent(new w.MouseEvent('click',{bubbles:true,button:2}));assert.deepEqual(w.AudioLab.getContext(),context);
 pass('canvas right-click suppresses only its native context menu and never invokes node editing');
 a=snap();pointer(area,'pointerdown',1,200,200);pointer(area,'pointermove',1,150,170);pointer(area,'pointercancel',1,150,170);b=snap();near(b.x-a.x,-50);near(b.y-a.y,-30);assert.equal(capture,null);
 pass('middle drag and cancelled pointer capture release the panning state');
 a=snap();let e=new w.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-120,clientX:451,clientY:311});area.dispatchEvent(e);b=snap();assert.equal(e.defaultPrevented,true);assert.ok(b.scale>a.scale);const aa=world(a,420,210),bb=world(b,420,210);near(aa.x,bb.x);near(aa.y,bb.y);
 pass('wheel zoom anchors at the cursor, including the viewport border, without page scrolling');
 a=snap();e=new w.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:3,deltaMode:1,clientX:451,clientY:311});area.dispatchEvent(e);assert.ok(snap().scale<a.scale);const panelWheel=new w.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:120});$('#settingsBody').dispatchEvent(panelWheel);assert.equal(panelWheel.defaultPrevented,false);
 pass('line-based wheels scale correctly while the settings panel retains normal scrolling');
 a=snap();const svgBefore=$('#routingSVG');w.AudioLab.setHardwareSnapshot(memory(),false);b=snap();assert.notEqual($('#routingSVG'),svgBefore);assert.equal(w.document.body.dataset.graphSource,'stale');near(a.x,b.x);near(a.y,b.y);near(a.scale,b.scale);assert.match($('#routeZoomValue').textContent,new RegExp('^'+Math.round(b.scale*100)+'%$'));assert.equal(device.sent.length,0);
 pass('snapshot refresh preserves pan/zoom and reports the actual camera scale with zero HID traffic');
 $('#routeFit').click();assert.equal(snap().autoFit,true);assert.equal($('#routeFit').getAttribute('aria-pressed'),'true');a=snap();$('#routeZoomIn').click();assert.ok(snap().scale>a.scale);assert.equal(snap().autoFit,false);$('#routeZoomOut').click();near(snap().scale,a.scale);
 pass('zoom buttons and fit use one camera instead of applying SVG scale twice');
 pointer($('#routingSVG [data-node="pga"]'),'pointerdown',0,200,200);assert.equal(area.classList.contains('panning'),false);$('#routingSVG [data-node="pga"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true,button:0}));assert.equal(w.AudioLab.getContext().node,'pga');assert.equal($('#settingsWindow').hidden,false);
 pass('left node click continues opening its module while drag gestures leave it unchanged');
 const mk=memory();mk[4]=4;mk[5]=4;w.AudioLab.setHardwareSnapshot(mk,true);w.AudioLab.navigate('eq');assert.match($('#deviceEQLabel').textContent,/16000.*不同/);assert.equal($('#eqChart .device-response'),null);
 pass('EQ refuses to overlay a device curve calculated at a different inferred sampling rate');
 const tools=$('.tools-menu');tools.open=true;$('#canvasScroll').dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:2}));assert.equal(tools.open,false);pointer(area,'pointerup',2,0,0,undefined);tools.open=true;w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(tools.open,false);assert.equal($('#settingsWindow').hidden,false);w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal($('#settingsWindow').hidden,true);
 pass('outside click and Escape dismiss tool menus before closing the settings panel');
 assert.equal($('#legacyTools').open,false);assert.equal(w.getComputedStyle($('#settingsWindow')).display,'none');assert.equal(w.document.querySelectorAll('#canvasScroll').length,1);assert.deepEqual(errors,[]);assert.equal(device.writes,0);
 pass('advanced legacy tools start collapsed, hidden panels stay hidden and layout CSS parses without errors');
 console.log(n+' viewport/layout checks passed; synthetic geometry and DOM, no browser screenshot or hardware I/O');
}finally{w.dispatchEvent(new w.Event('pagehide'));w.close();}
