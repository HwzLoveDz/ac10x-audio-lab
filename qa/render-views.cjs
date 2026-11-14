/* Native SVG layout review, not browser observation or a WebHID test. */
const fs=require('node:fs'),path=require('node:path'),{Resvg}=require('@resvg/resvg-js'),R=require('../routing.js'),E=require('../examples.js'),{config}=require('./fake-hid.cjs');
const out=path.resolve(process.argv[2]||'qa-views');fs.mkdirSync(out,{recursive:true});
const systemFont=path.join(process.env.SystemRoot||'C:/Windows','Fonts','msyh.ttc'),font=fs.existsSync(systemFont)?{loadSystemFonts:false,fontFiles:[systemFont],defaultFontFamily:'Microsoft YaHei'}:{loadSystemFonts:true};
const style=`text{font-family:"Microsoft YaHei","Segoe UI",sans-serif}.focus-title{font-size:21px;font-weight:600;fill:#274b41}.focus-subtitle{font-size:12px;fill:#708b80}.node-title{font-size:15px;font-weight:600;fill:#274b41}.node-subtitle{font-size:11px;fill:#628272}.graph-note{font-size:11px;fill:#728a7d}.graph-node rect{fill:#fff;stroke:#bed3c7;stroke-width:1.7}.graph-node.off rect{fill:#f3f6f4;stroke-dasharray:5 4}.edge-halo{fill:none;stroke:white;stroke-width:8}.edge-line{fill:none;stroke-width:3;stroke:#237f70}.play .edge-line{stroke:#a96f2c}.monitor .edge-line{stroke:#7862ae}.loopback .edge-line{stroke:#396fa3}.disabled .edge-line{stroke:#87959d;stroke-dasharray:6 5}.edge-flow{display:none}`;
const files=[];for(const view of [{id:'all'}])for(const detail of ['full']){
 const c=E.quickStart(config()),result=R.render(c,null,{focus:'all',zoom:1,animate:false});
 const svg=result.html.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ').replace(/(<svg[^>]*>)/,'$1<style>'+style+'</style>');
 const file=view.id+'-'+detail;fs.writeFileSync(path.join(out,file+'.svg'),svg);
 fs.writeFileSync(path.join(out,file+'.png'),new Resvg(svg,{background:'#f3f7f6',fitTo:{mode:'width',value:1126},font}).render().asPng());files.push(file);
}console.log(JSON.stringify({mode:'Native rendering of generated SVG; not browser screenshots',out,files}));
