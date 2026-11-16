/* Local S3 integration release. No hardware access, flashing or publication. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const [outputArg,auditArg]=process.argv.slice(2);if(!outputArg||!auditArg)throw Error('Pass NEW delivery directory and current audit directory');
const root=path.resolve(__dirname,'..'),out=path.resolve(outputArg),audit=path.resolve(auditArg),hash=data=>crypto.createHash('sha256').update(data).digest('hex');
if(out===root||fs.existsSync(out))throw Error('Output exists; refusing overwrite');
const report=JSON.parse(fs.readFileSync(path.join(audit,'offline-075.json'),'utf8'));
if(report.status!=='PASSED'||report.checks!==194||report.suites.length!==23)throw Error('Required complete software acceptance missing');
for(const [f,expected]of Object.entries(report.sourceHashes))if(hash(fs.readFileSync(path.join(root,f)))!==expected)throw Error('Source changed after tests: '+f);
const preservation=JSON.parse(fs.readFileSync(path.join(audit,'core-preservation.json'),'utf8'));if(preservation.status!=='PASSED')throw Error('Core preservation evidence missing');
const fixtures=require('./fixtures/legacy-adapter-parity.json');if(fixtures.cases.reduce((n,c)=>n+c.reports.length,0)!==2135)throw Error('Legacy parity fixture incomplete');
const E=require('../examples.js');
const files=fs.readdirSync(root).filter(n=>fs.statSync(path.join(root,n)).isFile()&&/\.(?:js|css|html|md|json|yaml)$/.test(n));
function qa(dir,base='qa/'){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isDirectory())qa(path.join(dir,e.name),base+e.name+'/');else if(/\.(?:cjs|py|json)$/.test(e.name)&&(!e.name.startsWith('package-')||e.name==='package-ui075.cjs'))files.push(base+e.name);}}qa(path.join(root,'qa'));
fs.mkdirSync(out,{recursive:true});for(const f of files){const target=path.join(out,f);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,f),target);}
fs.mkdirSync(path.join(out,'acceptance'),{recursive:true});for(const n of ['offline-075.json','core-preservation.json','s3-integration-provenance.json'])fs.copyFileSync(path.join(audit,n),path.join(out,'acceptance',n));
const historical=path.join(audit,'historical');if(fs.existsSync(historical))fs.cpSync(historical,path.join(out,'acceptance','historical'),{recursive:true});
fs.writeFileSync(path.join(out,'examples-catalog.json'),JSON.stringify({format:'AC10x-example-catalog',schemaVersion:1,version:'0.7.5-rc.1',views:E.views,routeExamples:E.routeExamples,eqPresets:E.eqPresets},null,2));
const manifest={version:'0.7.5-rc.1',createdAt:new Date().toISOString(),status:'local-software-integration-candidate',offlineChecks:194,softwareSuites:23,adapterKinds:['TI','S31','S3'],s3:{vendorId:0x303a,productId:0x4005,protocolVersion:'0.1',softwareCandidate:true,hardwareValidated:false,developmentIdentifier:true},legacyByteParity:{referenceVersion:fixtures.originVersion,TI:1118,S31:1017},routeViews:8,routeExamples:17,eqPresets:16,languages:['zh-CN','en'],boundaryPolicy:'graph corners stop at viewport center',hardwareWritesThisChange:0,flashingPerformed:false,hardwareAccessPerformed:false,currentBrowserPixelAccepted:false,previousSvgReviewVersion:'0.7.4-rc.2',pending:['S3 board, power, pins and Flash confirmation','S3 real enumeration, I2S clocks, codec, audio and recovery tests','New-version browser pixel and permission acceptance','TI original bridge dynamic comparison','S31 High Speed audio verification'],sourceHashes:report.sourceHashes,publiclyPublished:false};
fs.writeFileSync(path.join(out,'MANIFEST.json'),JSON.stringify(manifest,null,2));
const entries=[];function walk(dir,base=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=base+e.name;if(e.isDirectory())walk(path.join(dir,e.name),f+'/');else entries.push(f);}}walk(out);
fs.writeFileSync(path.join(out,'SHA256SUMS.txt'),entries.sort().map(f=>hash(fs.readFileSync(path.join(out,f)))+'  '+f).join('\n')+'\n');
console.log(JSON.stringify({out,files:entries.length+1,version:manifest.version,offlineChecks:194,entrySha256:hash(fs.readFileSync(path.join(out,'AC10x-Audio-Lab-v0.7.5-rc.1.html')))}));
