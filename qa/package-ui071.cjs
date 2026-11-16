/* Local feature candidate package; no publishing or hardware operations. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const [outArg,auditArg]=process.argv.slice(2);if(!outArg||!auditArg)throw Error('Pass a NEW output directory and the UI071 audit directory');
const root=path.resolve(__dirname,'..'),out=path.resolve(outArg),audit=path.resolve(auditArg),hash=data=>crypto.createHash('sha256').update(data).digest('hex');
if(out===root)throw Error('Output cannot be the working source');
if(fs.existsSync(out)){
 if(!process.argv.includes('--refresh-own-candidate'))throw Error('Output already exists; refusing overwrite');
 const old=JSON.parse(fs.readFileSync(path.join(out,'MANIFEST.json'),'utf8'));if(old.version!=='0.7.1-rc.1'||old.status!=='local-feature-release-candidate'||old.publiclyPublished!==false)throw Error('Not this unpublished candidate');
 for(const line of fs.readFileSync(path.join(out,'SHA256SUMS.txt'),'utf8').trim().split(/\r?\n/)){const [expected,file]=line.split('  '),target=path.resolve(out,file||'');if(!file||!target.startsWith(out+path.sep)||hash(fs.readFileSync(target))!==expected)throw Error('Candidate edited; refusing overwrite: '+file);}
}
const report=JSON.parse(fs.readFileSync(path.join(audit,'offline-071.json'),'utf8')),core=JSON.parse(fs.readFileSync(path.join(audit,'hardware-core-compatibility.json'),'utf8'));
if(report.status!=='PASSED'||report.checks!==108||core.status!=='PASSED')throw Error('Required acceptance not passed');
for(const [file,expected]of Object.entries(report.sourceHashes))if(hash(fs.readFileSync(path.join(root,file)))!==expected)throw Error('Source changed after test: '+file);
const E=require('../examples.js'),views=fs.readdirSync(path.join(audit,'route-layouts')).filter(n=>n.endsWith('.png'));if(views.length!==14)throw Error('Expected fourteen native SVG review images');
const files=[...fs.readdirSync(root).filter(n=>fs.statSync(path.join(root,n)).isFile()&&/\.(?:js|css|html|md|json|yaml)$/.test(n)),...fs.readdirSync(path.join(root,'qa')).filter(n=>/\.(?:cjs|py)$/.test(n)).map(n=>'qa/'+n)];
fs.mkdirSync(out,{recursive:true});for(const file of files){const dest=path.join(out,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,file),dest);}
fs.mkdirSync(path.join(out,'acceptance'),{recursive:true});fs.copyFileSync(path.join(audit,'offline-071.json'),path.join(out,'acceptance/offline.json'));fs.copyFileSync(path.join(audit,'hardware-core-compatibility.json'),path.join(out,'acceptance/hardware-core-compatibility.json'));
fs.mkdirSync(path.join(out,'preview'),{recursive:true});for(const file of views)fs.copyFileSync(path.join(audit,'route-layouts',file),path.join(out,'preview',file));
fs.writeFileSync(path.join(out,'examples-catalog.json'),JSON.stringify({format:'AC10x-example-catalog',schemaVersion:1,version:'0.7.1-rc.1',views:E.views,routeExamples:E.routeExamples,eqPresets:E.eqPresets},null,2));
const manifest={version:'0.7.1-rc.1',createdAt:new Date().toISOString(),status:'local-feature-release-candidate',offlineChecks:108,routeViews:E.views.length,routeExamples:E.routeExamples.length,eqPresets:E.eqPresets.length,presetSampleRateCombinations:144,nativeSvgPreviews:14,hardwareWritesThisChange:0,priorActualHardwareEvidenceVersion:'0.7.0-rc.1',currentBrowserManualAccepted:false,priorBrowserReadOnlyAcceptedVersion:'0.7.0-rc.1',sourceHashes:report.sourceHashes,pending:['Original AC102_SW.exe and USB2I2S bridge materials not completely received','New-version actual browser manual visual review'],publiclyPublished:false};
fs.writeFileSync(path.join(out,'MANIFEST.json'),JSON.stringify(manifest,null,2));
const delivered=[];function walk(dir,base=''){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const relative=base+entry.name;if(entry.isDirectory())walk(path.join(dir,entry.name),relative+'/');else delivered.push(relative);}}walk(out);
const hashed=delivered.filter(file=>file!=='SHA256SUMS.txt');fs.writeFileSync(path.join(out,'SHA256SUMS.txt'),hashed.sort().map(file=>hash(fs.readFileSync(path.join(out,file)))+'  '+file).join('\n')+'\n');
console.log(JSON.stringify({out,files:hashed.length+1,version:manifest.version,offlineChecks:manifest.offlineChecks,entrySha256:hash(fs.readFileSync(path.join(out,'AC10x-Audio-Lab.html')))}));
