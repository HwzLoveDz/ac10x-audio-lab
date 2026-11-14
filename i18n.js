/* UI localization only: text and accessibility attributes. No device or configuration I/O. */
(function(root){
'use strict';
const common=typeof module!=='undefined'&&module.exports,catalog=common?require('./locale-catalog.js'):root.AudioLocaleCatalog;
const cjk=/[\u3400-\u9fff]/,escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const parts=Object.keys(catalog).filter(k=>k&&cjk.test(k)).sort((a,b)=>b.length-a.length),pattern=new RegExp(parts.map(escape).join('|'),'g');
const glyphAdvance={" ":0.274,"!":0.284,"\"":0.392,"#":0.591,"$":0.539,"%":0.818,"&":0.8,"'":0.23,"(":0.302,")":0.302,"*":0.417,"+":0.684,",":0.217,"-":0.4,".":0.217,"/":0.39,"0":0.539,"1":0.539,"2":0.539,"3":0.539,"4":0.539,"5":0.539,"6":0.539,"7":0.539,"8":0.539,"9":0.539,":":0.217,";":0.217,"<":0.684,"=":0.684,">":0.684,"?":0.448,"@":0.955,"A":0.645,"B":0.573,"C":0.619,"D":0.701,"E":0.506,"F":0.488,"G":0.686,"H":0.71,"I":0.266,"J":0.357,"K":0.58,"L":0.471,"M":0.898,"N":0.748,"O":0.754,"P":0.56,"Q":0.754,"R":0.598,"S":0.531,"T":0.524,"U":0.687,"V":0.621,"W":0.934,"X":0.59,"Y":0.553,"Z":0.57,"[":0.302,"\\":0.379,"]":0.302,"^":0.684,"_":0.415,"`":0.268,"a":0.509,"b":0.588,"c":0.462,"d":0.589,"e":0.523,"f":0.313,"g":0.589,"h":0.566,"i":0.242,"j":0.242,"k":0.497,"l":0.242,"m":0.861,"n":0.566,"o":0.586,"p":0.588,"q":0.589,"r":0.348,"s":0.424,"t":0.339,"u":0.566,"v":0.479,"w":0.723,"x":0.459,"y":0.484,"z":0.452,"{":0.302,"|":0.239,"}":0.302,"~":0.684,"·":0.217,"−":0.684,"→":0.863,"²":0.366,"×":0.684,"Σ":0.516,"Δ":0.645,"–":0.5,"—":1.0,"₀":0.366,"₁":0.351,"₂":0.366,"₃":0.366,"₄":0.351,"₅":0.366,"⁻":0.366,"⁶":0.366};
function measureText(text,size){return Array.from(text).reduce((sum,c)=>sum+(glyphAdvance[c]??(cjk.test(c)?1:.65)),0)*size;}
function translate(input,language='en'){
 const text=String(input??'');if(language!=='en'||!cjk.test(text))return text;
 const trim=text.trim();if(Object.hasOwn(catalog,trim))return text.slice(0,text.indexOf(trim))+catalog[trim]+text.slice(text.indexOf(trim)+trim.length);
 return text.replace(/第\s*(\d+)\s*段/g,'Band $1').replace(pattern,(match,offset,all)=>{
  return ' '+catalog[match]+' ';
 }).replace(/。/g,'. ').replace(/，/g,', ').replace(/；/g,'; ').replace(/：/g,': ').replace(/[“”]/g,'"').replace(/[（]/g,'(').replace(/[）]/g,')').replace(/ {2,}/g,' ').replace(/ +([,.;:!?])/g,'$1').replace(/\b0x +([0-9a-f])/gi,'0x$1');
}
function install(doc,win){
 const key='ac10x-audio-lab-language',attrs=['title','placeholder','aria-label','aria-valuetext','label'],texts=new WeakMap(),attributes=new WeakMap(),svgStyles=new WeakMap();let language='zh-CN',observer;
 try{if(win.localStorage.getItem(key)==='en')language='en';}catch{}
 const excluded=el=>Boolean(el?.closest?.('script,style,textarea,pre,code,kbd,[data-no-i18n]'));
 function textNode(node){if(excluded(node.parentElement))return;let row=texts.get(node);if(!row||node.nodeValue!==row.rendered){row={source:node.nodeValue,rendered:node.nodeValue};texts.set(node,row);}const value=translate(row.source,language);if(node.nodeValue!==value)node.nodeValue=value;row.rendered=value;}
 function attr(el,name){if(excluded(el)||!el.hasAttribute(name))return;let map=attributes.get(el);if(!map){map={};attributes.set(el,map);}let row=map[name],current=el.getAttribute(name);if(!row||current!==row.rendered)row=map[name]={source:current,rendered:current};const value=translate(row.source,language);if(current!==value)el.setAttribute(name,value);row.rendered=value;}
 function apply(node){if(!node)return;if(node.nodeType===3){textNode(node);return;}if(node.nodeType!==1&&node.nodeType!==9&&node.nodeType!==11)return;if(node.nodeType===1){if(excluded(node))return;for(const name of attrs)attr(node,name);}const walk=doc.createTreeWalker(node,win.NodeFilter.SHOW_TEXT);while(walk.nextNode())textNode(walk.currentNode);for(const el of node.querySelectorAll?.('[title],[placeholder],[aria-label],[aria-valuetext],[label]')||[])for(const name of attrs)attr(el,name);}
 function fitLabels(){
  for(const el of doc.querySelectorAll('#routingSVG .graph-node text')){
   const rect=el.closest('.graph-node')?.querySelector('rect'),width=Number(rect?.getAttribute('width'))-16;if(!(width>0))continue;
   let original=svgStyles.get(el);if(!original){original={font:el.style.fontSize,length:el.getAttribute('textLength'),adjust:el.getAttribute('lengthAdjust')};svgStyles.set(el,original);}
   el.style.fontSize=original.font;for(const [name,value]of [['textLength',original.length],['lengthAdjust',original.adjust]]){if(value===null)el.removeAttribute(name);else el.setAttribute(name,value);}
   const base=typeof el.getComputedTextLength==='function'?(parseFloat(win.getComputedStyle(el).fontSize)||12):(parseFloat(original.font)||parseFloat(el.getAttribute('font-size'))||(el.classList.contains('node-title')?15:el.closest('.focused-routing')?11:12));
   const measure=()=>{try{const n=el.getComputedTextLength?.();if(n>0)return n;}catch{}return measureText(el.textContent,parseFloat(el.style.fontSize)||base);};
   let length=measure();if(length>width){el.style.fontSize=Math.max(9,base*(width-1)/length)+'px';length=measure();if(length>width){el.setAttribute('textLength',String(width));el.setAttribute('lengthAdjust','spacingAndGlyphs');}}
  }
 }
 function sourceText(el){if(!el)return'';if(el.nodeType===3){const row=texts.get(el);return row&&el.nodeValue===row.rendered?row.source:el.nodeValue;}const walk=doc.createTreeWalker(el,win.NodeFilter.SHOW_TEXT);let value='';while(walk.nextNode()){const node=walk.currentNode,row=texts.get(node);value+=row&&node.nodeValue===row.rendered?row.source:node.nodeValue;}return value;}
 const initialTitle=doc.title;
 function setLanguage(value){if(!['zh-CN','en'].includes(value))throw Error('Unsupported UI language');language=value;doc.documentElement.lang=language;doc.title=translate(initialTitle,language);const select=doc.getElementById('languageSwitch');if(select)select.value=language;apply(doc.body);fitLabels();try{win.localStorage.setItem(key,language);}catch{}win.dispatchEvent(new win.CustomEvent('audiolab:languagechange',{detail:{language}}));}
 observer=new win.MutationObserver(records=>{
  const nodes=new Set();let refit=false;
  for(const record of records){if(record.type==='attributes')attr(record.target,record.attributeName);else if(record.type==='characterData'){textNode(record.target);if(record.target.parentElement?.closest('#routeDiagram'))refit=true;}else{for(const node of record.addedNodes){nodes.add(node);if(node.nodeType===1&&(node.id==='routingSVG'||node.querySelector?.('#routingSVG')))refit=true;}}}
  for(const node of nodes)apply(node);if(refit)fitLabels();
 });
 observer.observe(doc.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:attrs});
 doc.getElementById('languageSwitch')?.addEventListener('change',e=>setLanguage(e.target.value));
 win.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
 const api={translate:s=>translate(s,language),setLanguage,getLanguage:()=>language,sourceText,sourceAttribute:(el,name)=>attributes.get(el)?.[name]?.source??el.getAttribute(name),refresh:()=>{apply(doc.body);fitLabels();}};setLanguage(language);return api;
}
const api={translate,install,measureText};if(common)module.exports=api;else{root.AudioI18n=install(root.document,root);}
})(typeof globalThis!=='undefined'?globalThis:this);
