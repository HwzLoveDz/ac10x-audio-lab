/* Camera geometry and canvas gestures. No codec configuration or hardware I/O. */
(function(root){
'use strict';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
class Camera{
 constructor(){this.x=0;this.y=0;this.scale=1;this.autoFit=true;this.width=1;this.height=1;this.contentWidth=1;this.contentHeight=1;this.key=null;}
 constrain(){const axis=(position,viewport,content)=>clamp(position,viewport/2-content,viewport/2);this.x=axis(this.x,this.width,this.contentWidth*this.scale);this.y=axis(this.y,this.height,this.contentHeight*this.scale);}
 snapshot(){return{x:this.x,y:this.y,scale:this.scale,autoFit:this.autoFit,width:this.width,height:this.height,contentWidth:this.contentWidth,contentHeight:this.contentHeight};}
 fit(){const inset=Math.min(24,this.width/10,this.height/10);this.scale=clamp(Math.min((this.width-inset*2)/this.contentWidth,(this.height-inset*2)/this.contentHeight),.05,4);this.x=(this.width-this.contentWidth*this.scale)/2;this.y=(this.height-this.contentHeight*this.scale)/2;this.autoFit=true;this.constrain();}
 content(w,h,key){if(!(w>0&&h>0&&Number.isFinite(w+h)))return;const changed=key!==this.key;this.contentWidth=w;this.contentHeight=h;this.key=key;if(changed||this.autoFit)this.fit();else this.constrain();}
 resize(w,h){if(!(w>0&&h>0&&Number.isFinite(w+h)))return;const cx=(this.width/2-this.x)/this.scale,cy=(this.height/2-this.y)/this.scale;this.width=w;this.height=h;if(this.autoFit)this.fit();else{this.x=w/2-cx*this.scale;this.y=h/2-cy*this.scale;this.constrain();}}
 zoom(next,px=this.width/2,py=this.height/2){if(!Number.isFinite(next+px+py)||next<=0)return;next=clamp(next,.05,4);if(Math.abs(next-this.scale)<1e-10)return;const wx=(px-this.x)/this.scale,wy=(py-this.y)/this.scale;this.x=px-wx*next;this.y=py-wy*next;this.scale=next;this.autoFit=false;this.constrain();}
 pan(dx,dy){if(!Number.isFinite(dx+dy))return;const x=this.x,y=this.y;this.x+=dx;this.y+=dy;this.constrain();if(Math.abs(this.x-x)>1e-9||Math.abs(this.y-y)>1e-9)this.autoFit=false;}
}
function svgPoint(rect,viewBox,clientX,clientY){
 const parts=String(viewBox||'').trim().split(/[ ,]+/).map(Number),[vx,vy,w,h]=parts;if(parts.length!==4||!(w>0&&h>0&&rect.width>0&&rect.height>0))return null;
 const scale=Math.min(rect.width/w,rect.height/h),left=rect.left+(rect.width-w*scale)/2,top=rect.top+(rect.height-h*scale)/2;
 return{x:vx+(clientX-left)/scale,y:vy+(clientY-top)/scale};
}
class Canvas{
 constructor(area,diagram,{onChange=()=>{}}={}){
  this.area=area;this.diagram=diagram;this.onChange=onChange;this.camera=new Camera();this.handlers=[];this.window=area.ownerDocument.defaultView;this.drag=null;this.blockClickUntil=0;
  const listen=(target,type,fn,options)=>{target.addEventListener(type,fn,options);this.handlers.push(()=>target.removeEventListener(type,fn,options));};
  listen(area,'contextmenu',e=>e.preventDefault());
  listen(area,'wheel',e=>{if(!e.deltaY||!Number.isFinite(e.deltaY))return;e.preventDefault();const rect=area.getBoundingClientRect(),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?this.camera.height:1);this.camera.zoom(this.camera.scale*Math.exp(-clamp(delta,-160,160)*.002),e.clientX-rect.left-area.clientLeft,e.clientY-rect.top-area.clientTop);this.paint();},{passive:false});
  listen(area,'pointerdown',e=>{
   if(![0,1,2].includes(e.button)||(e.button===0&&e.target.closest('[data-node],button,a,input,select,textarea')))return;
   if(this.drag)return;this.drag={id:e.pointerId,button:e.button,x:e.clientX,y:e.clientY,moved:0};area.setPointerCapture?.(e.pointerId);area.classList.add('panning');e.preventDefault();
  });
  listen(area,'pointermove',e=>{const d=this.drag;if(!d||d.id!==e.pointerId)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;d.moved+=Math.hypot(dx,dy);d.x=e.clientX;d.y=e.clientY;this.camera.pan(dx,dy);this.paint();e.preventDefault();});
  const end=e=>{if(!this.drag||(e?.pointerId!==undefined&&e.pointerId!==this.drag.id))return;const d=this.drag;this.drag=null;area.classList.remove('panning');if(d.button===0&&d.moved>3)this.blockClickUntil=Date.now()+250;try{if(area.hasPointerCapture?.(d.id))area.releasePointerCapture(d.id);}catch{}};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(area,type,end);
  listen(this.window,'blur',()=>end());
  listen(area,'click',e=>{if(e.button===0&&Date.now()<this.blockClickUntil){e.preventDefault();e.stopImmediatePropagation();this.blockClickUntil=0;}},true);
  listen(area,'dblclick',e=>{if(e.button===0&&!e.target.closest('[data-node]')){e.preventDefault();this.fit();}});
  listen(area,'keydown',e=>{if(e.target!==area||e.ctrlKey||e.metaKey||e.altKey)return;const c=this.camera,n=e.shiftKey?120:40;let handled=true;if(e.key==='+'||e.key==='=')this.zoomBy(1.2);else if(e.key==='-')this.zoomBy(1/1.2);else if(e.key==='0')this.fit();else if(e.key==='ArrowLeft')c.pan(n,0);else if(e.key==='ArrowRight')c.pan(-n,0);else if(e.key==='ArrowUp')c.pan(0,n);else if(e.key==='ArrowDown')c.pan(0,-n);else handled=false;if(handled){e.preventDefault();this.paint();}});
  listen(this.window,'resize',()=>this.measure());
  if(this.window.ResizeObserver){this.observer=new this.window.ResizeObserver(()=>this.measure());this.observer.observe(area);}
  this.measure();
 }
 measure(){const r=this.area.getBoundingClientRect();this.camera.resize(this.area.clientWidth||r.width||this.window.innerWidth,this.area.clientHeight||r.height||this.window.innerHeight);this.paint();}
 content(w,h,key){this.camera.content(w,h,key);this.paint();}
 paint(){const c=this.camera;this.diagram.style.transform='translate('+c.x.toFixed(3)+'px,'+c.y.toFixed(3)+'px) scale('+c.scale.toFixed(6)+')';this.onChange(c.snapshot());}
 fit(){this.measure();this.camera.fit();this.paint();}
 zoomBy(factor){this.camera.zoom(this.camera.scale*factor);this.paint();}
 destroy(){this.observer?.disconnect();for(const remove of this.handlers)remove();this.handlers=[];this.drag=null;this.area.classList.remove('panning');}
}
const api={Camera,Canvas,svgPoint};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AudioViewport=api;
})(typeof globalThis!=='undefined'?globalThis:this);
