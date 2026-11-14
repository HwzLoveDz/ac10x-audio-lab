const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const [previousRoot,output]=process.argv.slice(2);if(!previousRoot)throw Error('Pass the prior source directory explicitly');
const root=path.resolve(__dirname,'..'),prior=path.resolve(previousRoot),hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const result={mode:'Source compatibility comparison; no hardware connection',comparedAt:new Date().toISOString(),files:{},routingMethods:{}};
for(const file of ['codec.js','session.js','transport.js']){const before=hash(fs.readFileSync(path.join(prior,file))),after=hash(fs.readFileSync(path.join(root,file)));assert.equal(after,before,file);result.files[file]={before,after,unchanged:true};}
const previous=require(path.join(prior,'routing.js')),current=require('../routing.js');
for(const key of ['defaults','normalize','equivalent','validate','lineGainDb','lineGainCode','registers']){const before=hash(previous[key].toString().replace(/\r\n/g,'\n')),after=hash(current[key].toString().replace(/\r\n/g,'\n'));assert.equal(after,before,key);result.routingMethods[key]={before,after,unchanged:true};}
result.status='PASSED';if(output)fs.writeFileSync(path.resolve(output),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
