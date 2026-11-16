const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const file of ['style.css','workbench.css','layout.css'])html=html.replace('<link rel="stylesheet" href="'+file+'">',()=>'<style>'+fs.readFileSync(path.join(root,file),'utf8')+'</style>');
for(const file of ['dsp.js','routing.js','transport.js','codec.js','debug.js','examples.js','session.js','legacy.js','capture.js','viewport.js','locale-catalog.js','i18n.js','app.js','hardware.js','usability.js'])html=html.replace('<script src="'+file+'"></script>',()=>'<script>'+fs.readFileSync(path.join(root,file),'utf8').replace(/<\/script/gi,'<\\/script')+'</script>');
fs.writeFileSync(path.join(root,'AC10x-Audio-Lab.html'),html);
const version=html.match(/<title>AC10x Audio Lab v(\d+\.\d+\.\d+(?:-rc\.\d+)?) /)?.[1];
if(version)fs.writeFileSync(path.join(root,'AC10x-Audio-Lab-v'+version+'.html'),html);
console.log('Built standalone HTML '+Buffer.byteLength(html)+' bytes');

