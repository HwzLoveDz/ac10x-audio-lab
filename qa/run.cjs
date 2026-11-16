const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const suites=['build.cjs','verify.cjs','verify-hardware.cjs','verify-lineout.cjs','verify-monitor.cjs','verify-transitions.cjs','verify-s31.cjs','verify-s31-ui.cjs','verify-adapters.cjs','verify-s3-ui.cjs','verify-usability.cjs','verify-ui-review-regressions.cjs','verify-release-core.cjs','verify-release-ui.cjs','verify-audio-lifecycle.cjs','verify-examples.cjs','verify-route-ui.cjs','verify-legacy.cjs','verify-capture.cjs','verify-capture-ui.cjs','verify-viewport.cjs','verify-i18n.cjs','audit-locale.cjs','audit-messages.cjs','verify-bilingual-review.cjs','verify-http.cjs','monkey-probes.cjs','verify-quick-start.cjs','verify-quick-examples.cjs','verify-loopback-processing.cjs','verify-accessibility.cjs','verify-properties.cjs','verify-scheduler.cjs'];
suites.splice(suites.indexOf('verify-properties.cjs'),0,'verify-handoff.cjs');
suites.splice(suites.indexOf('verify-properties.cjs'),0,'verify-theme-layout.cjs');
suites.splice(suites.indexOf('verify-properties.cjs'),0,'verify-full-wiring.cjs','verify-pipeline-clocks.cjs','verify-default-firmware.cjs');
suites.splice(suites.indexOf('verify-properties.cjs'),0,'verify-physical-bypass.cjs');
const evidenceRoot=process.argv[2]?path.dirname(path.resolve(process.argv[2])):null;
const result={startedAt:new Date().toISOString(),mode:'Offline calculations / synthetic DOM / protocol fixtures only',suites:[],checks:0,status:'PASSED'};
for(const suite of suites){
 const p=spawnSync(process.execPath,[path.join(__dirname,suite),...(evidenceRoot&&['verify-properties.cjs','verify-scheduler.cjs'].includes(suite)?['--output',evidenceRoot]:[])],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:suite==='verify-quick-examples.cjs'?180000:['audit-locale.cjs','verify-properties.cjs','verify-scheduler.cjs'].includes(suite)?120000:60000,windowsHide:true});
 process.stdout.write(p.stdout||'');process.stderr.write(p.stderr||'');
 const count=(p.stdout?.match(/^PASS /gm)||[]).length;result.checks+=count;
 result.suites.push({suite,checks:count,exitCode:p.status,error:p.error?.message||null,stdout:p.stdout,stderr:p.stderr});
 if(p.status!==0||p.error){result.status='FAILED';process.exitCode=1;break;}
}
result.completedAt=new Date().toISOString();
result.sourceHashes=Object.fromEntries(['index.html','style.css','workbench.css','layout.css','dsp.js','routing.js','transport.js','codec.js','debug.js','examples.js','session.js','legacy.js','capture.js','viewport.js','locale-catalog.js','i18n.js','app.js','hardware.js','usability.js','AC10x-Audio-Lab.html'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'..',file))).digest('hex')]));
const output=process.argv[2];if(output)fs.writeFileSync(path.resolve(output),JSON.stringify(result,null,2));
console.log(result.status+': '+result.checks+' offline checks; no hardware I/O');

