/* Local comparison release candidate. No publication, hardware I/O, or legacy program execution. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const [outputArg,auditArg]=process.argv.slice(2);if(!outputArg||!auditArg)throw Error('Pass a NEW delivery directory and current audit directory');
const root=path.resolve(__dirname,'..'),out=path.resolve(outputArg),audit=path.resolve(auditArg),hash=data=>crypto.createHash('sha256').update(data).digest('hex');
if(out===root||fs.existsSync(out))throw Error('Output exists; refusing overwrite');
const read=n=>JSON.parse(fs.readFileSync(path.join(audit,n),'utf8'));
const report=read('offline-072.json'),core=read('hardware-core-compatibility.json'),original=read('original-package-receipt.json'),compat=read('actual-original-compatibility.json');
if(report.status!=='PASSED'||report.checks!==136||core.status!=='PASSED'||compat.status!=='PASSED'||compat.checks!==4||original.manifestSizeAndHashPassed!==92||original.extractedSizeAndHashPassed!==92)throw Error('Required acceptance missing or failed');
for(const [f,expected]of Object.entries(report.sourceHashes))if(hash(fs.readFileSync(path.join(root,f)))!==expected)throw Error('Source changed after tests: '+f);
const E=require('../examples.js');
const files=fs.readdirSync(root).filter(n=>fs.statSync(path.join(root,n)).isFile()&&/\.(?:js|css|html|md|json|yaml)$/.test(n));
for(const n of fs.readdirSync(path.join(root,'qa')))if(/\.(?:cjs|py)$/.test(n)&&(!n.startsWith('package-')||n==='package-ui072.cjs'))files.push('qa/'+n);
fs.mkdirSync(out,{recursive:true});for(const f of files){const target=path.join(out,f);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,f),target);}
fs.mkdirSync(path.join(out,'acceptance'),{recursive:true});for(const n of ['offline-072.json','hardware-core-compatibility.json','original-package-receipt.json','actual-original-compatibility.json','original-usb-descriptor-candidates.json'])fs.copyFileSync(path.join(audit,n),path.join(out,'acceptance',n));
fs.writeFileSync(path.join(out,'examples-catalog.json'),JSON.stringify({format:'AC10x-example-catalog',schemaVersion:1,version:'0.7.2-rc.1',views:E.views,routeExamples:E.routeExamples,eqPresets:E.eqPresets},null,2));
const manifest={version:'0.7.2-rc.1',createdAt:new Date().toISOString(),status:'local-comparison-release-candidate',offlineChecks:136,actualOriginalFileCompatibilityChecks:4,originalArchiveVerifiedFiles:92,originalProgramExecuted:false,originalCommercialFilesBundled:false,routeViews:8,routeExamples:17,eqPresets:16,presetSampleRateCombinations:144,captureMaxSeconds:30,hardwareWritesThisChange:0,priorActualHardwareEvidenceVersion:'0.7.0-rc.1',currentBrowserManualAccepted:false,pending:['New-version actual browser visual / capture permission / PCM recording acceptance','TI original bridge dynamic comparison not performed','S31 High Speed audio remains unverified'],sourceHashes:report.sourceHashes,publiclyPublished:false};
fs.writeFileSync(path.join(out,'MANIFEST.json'),JSON.stringify(manifest,null,2));
const entries=[];function walk(dir,base=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=base+e.name;if(e.isDirectory())walk(path.join(dir,e.name),f+'/');else entries.push(f);}}walk(out);
fs.writeFileSync(path.join(out,'SHA256SUMS.txt'),entries.sort().map(f=>hash(fs.readFileSync(path.join(out,f)))+'  '+f).join('\n')+'\n');
console.log(JSON.stringify({out,files:entries.length+1,version:manifest.version,offlineChecks:136,actualFileChecks:4,entrySha256:hash(fs.readFileSync(path.join(out,'AC10x-Audio-Lab-v0.7.2-rc.1.html')))}));
