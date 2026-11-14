/* QA-only rendered sRGB text contrast measurement. SVG rect fill and opacity included. */
(()=>{
 const parse=value=>{const m=String(value).match(/^rgba?\(([^)]+)\)/);if(!m)return null;const v=m[1].split(/[ ,/]+/).filter(Boolean).map(Number);return[v[0],v[1],v[2],v[3]??1];};
 const over=(a,b)=>[...a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3])),1];
 const luminance=c=>c.slice(0,3).map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 const path=el=>el.id?'#'+el.id:el.tagName.toLowerCase()+(el.classList?.length?'.'+[...el.classList].slice(0,2).join('.'):'' );
 window.RenderedContrast={ratio,scan(){
  const failures=[],unresolved=[],samples=[];let checked=0;
  for(const el of document.querySelectorAll('body *')){
   if(el.closest('#qaIsolationPanel')||['SCRIPT','STYLE','OPTION','NOSCRIPT'].includes(el.tagName))continue;
   const text=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').trim()||(['INPUT','SELECT','TEXTAREA'].includes(el.tagName)&&!['checkbox','radio','range','file'].includes(el.type)?el.value:'');if(!text)continue;
   const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none'||!el.getClientRects().length||el.closest('[disabled],fieldset:disabled'))continue;
   const chain=[];let opacity=1,hidden=false;for(let p=el;p;p=p.parentElement){const style=getComputedStyle(p);if(p.hidden||style.display==='none'||style.visibility==='hidden'||(p.tagName==='DETAILS'&&!p.open&&!p.querySelector(':scope > summary')?.contains(el)))hidden=true;chain.unshift(p);opacity*=Number(style.opacity);}
   if(hidden)continue;
   if(opacity===0)continue;
   let bg=[255,255,255,1];const images=[];
   for(const parent of chain){const style=getComputedStyle(parent);const color=parse(style.backgroundColor);if(color)bg=over(color,bg);if(style.backgroundImage!=='none')images.push(path(parent));}
   if(el instanceof SVGElement){let group=el.parentElement;while(group&&group instanceof SVGElement){const rect=[...group.children].find(n=>n.tagName.toLowerCase()==='rect');if(rect){const fill=parse(getComputedStyle(rect).fill);if(fill)bg=over(fill,bg);break;}group=group.parentElement;}}
   let fg=parse(el instanceof SVGElement?cs.fill:cs.color);if(!fg){unresolved.push({target:path(el),text:text.slice(0,65),reason:'Unparsed text color'});continue;}
   fg=over([fg[0],fg[1],fg[2],fg[3]*opacity],bg);const result=ratio(fg,bg),size=parseFloat(cs.fontSize),bold=Number(cs.fontWeight)>=700,required=size>=24||(bold&&size>=18.66)?3:4.5;
   const item={target:path(el),text:text.slice(0,80),foreground:fg.slice(0,3).map(Math.round),background:bg.slice(0,3).map(Math.round),ratio:+result.toFixed(2),required,fontSize:size,images};checked++;samples.push(item);if(result<required)failures.push(item);
  }
  return{timestamp:new Date().toISOString(),context:AudioLab.getContext(),lang:document.documentElement.lang,viewport:[innerWidth,innerHeight],checked,failures,unresolved,samples};
 }};
})();
