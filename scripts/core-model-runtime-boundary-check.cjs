const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),dir='core/node/modelRuntime';
const limits={'api.ts':40,'attempt.ts':30,'health.ts':30,'host.ts':10,'log.ts':20,'owner.ts':100,'policy.ts':15,'ports.ts':25,'settings.ts':15,'startup.ts':60,'state.ts':20};
assert.deepEqual(fs.readdirSync(path.join(root,dir)).sort(),Object.keys(limits).sort());
for(const[file,max]of Object.entries(limits)){
 const source=read(dir+'/'+file);assert.ok(source.split(/\r?\n/).length<=max,file+' responsibility');assert.doesNotMatch(source,/from ["']electron["']|Sqlite|sqlite|Catalog|Reader\.Host|ShellExecute/,file+' ordinary model-only domain');
 if(!['attempt.ts','health.ts','ports.ts','log.ts'].includes(file))assert.doesNotMatch(source,/from ["']node:(?:fs|net|http|https|child_process)|\bspawn\(|\bfetch\(/,file+' bypasses its owned resource adapters');
}
const http=read(dir+'/health.ts');for(const a of ['hostname:"127.0.0.1"','proxyEnv:undefined','maximumBytes=1024*1024','agent.destroy()','"/health"|"/v1/models"'])assert.ok(http.includes(a));assert.doesNotMatch(http,/fetch\(|http\.globalAgent|headers\.location|process\.env/);
const processOwner=read(dir+'/attempt.ts');for(const a of ['windowsHide:true','shell:false','5000','1000','slice(-10000)'])assert.ok(processOwner.includes(a));assert.doesNotMatch(processOwner,/node:(?:fs|http|https|net)/);
const log=read(dir+'/log.ts');assert.ok(log.includes('path.join(root,"logs","llama-runtime.log")'));assert.ok(log.includes('1024*1024'));assert.doesNotMatch(log,/readFile|readdir|unlink|rename|copyFile|\.rm\(/);
const owner=read(dir+'/owner.ts');for(const a of ['llamaRuntimeAiIdleTimeoutMs','this.queuedStarts>0','accepted!==this.revision','this.retiring','this.abort?.abort()','this.state.release()'])assert.ok(owner.includes(a));
for(const[file,max]of [['electron/llamaRuntimeManager.ts',30],['electron/core/coreModelRuntimeClient.ts',65],['electron/core/coreModelHost.ts',35],['electron/core/coreModelRuntimeValidation.ts',35]]){
 const source=read(file);assert.ok(source.split(/\r?\n/).length<=max,file+' Shell boundary');assert.doesNotMatch(source,/node:(?:fs|net|http|https|child_process)|\bspawn\(|\bfetch\(|setInterval\(|managedProcess|performStart/,file+' regained backend ownership');
}
assert.ok(read('electron/core/coreModelHost.ts').includes('"model-runtime.cjs"'));assert.doesNotMatch(read('core/node/visualCache/dispatch.ts'),/modelSettings|modelRuntime/);
assert.ok(read('scripts/metadata-worker-build.cjs').includes('core/node/modelRuntime/host.ts'));assert.ok(read('electron/llamaRuntimeManager.ts').includes('shutdownCoreModelHost'));
console.log('Independent Core model Job, fixed resources, local-only health, process/log/state ownership, last-stop fencing and thin Shell mirror boundaries passed.');
