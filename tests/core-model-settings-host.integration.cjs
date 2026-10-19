const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),esbuild=require('esbuild');
const {CoreVisualCacheClient}=require('../dist-electron/core/coreVisualCacheClient.js');
const {metadataWorkerPaths}=require('../dist-electron/metadataExtraction/metadataWorkerPaths.js');
(async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'cap7ce-model-settings-host-'));let client;try{
 const worker=path.join(root,'visual-cache.cjs');await esbuild.build({entryPoints:[path.resolve('core/node/visualCache/host.ts')],bundle:true,platform:'node',format:'cjs',target:'node24',outfile:worker});
 const profile=path.join(root,'profile'),runtimeRoot=path.join(root,'llama.cpp'),modelsRoot=path.join(root,'models');
 client=new CoreVisualCacheClient(profile,metadataWorkerPaths().executable,worker);
 const ctx={runtimeRoot,modelsRoot,language:'zh-CN'},invoke=(op,selection=null)=>client.request('modelSettings.invoke',[ctx,op,selection]);
 assert.equal((await invoke('runtime.settings')).status,'missing_root');await assert.rejects(fs.stat(profile),{code:'ENOENT'});
 await fs.mkdir(path.join(runtimeRoot,'b2'),{recursive:true});await fs.writeFile(path.join(runtimeRoot,'b2','llama-server.exe'),'never executed sentinel');
 await fs.mkdir(modelsRoot,{recursive:true});await fs.writeFile(path.join(modelsRoot,'qwen-q4.gguf'),'never loaded sentinel');await fs.writeFile(path.join(modelsRoot,'mmproj-qwen-f16.gguf'),'never loaded sentinel');
 assert.equal((await invoke('runtime.select','b2')).status,'available');assert.equal((await invoke('models.select','qwen-q4.gguf')).status,'ready');
 const selected=await invoke('models.selectedRuntime');assert.equal(selected.modelPath,path.join(modelsRoot,'qwen-q4.gguf'));assert.equal(await invoke('models.selectedId'),'qwen-q4.gguf');
 await assert.rejects(invoke('models.select','../escape'));assert.equal(JSON.parse(await fs.readFile(path.join(profile,'config','gguf-model.json'))).selectedModelId,'qwen-q4.gguf');
 assert.equal(await fs.readFile(path.join(modelsRoot,'qwen-q4.gguf'),'utf8'),'never loaded sentinel');
 console.log('Real Core Node model settings: pinned standalone runtime/native Job, private frames, configuration CRUD, paired paths and rejected invalid selection passed without starting a model.');
 }finally{client?.close();if(client)await Promise.allSettled([...client.exits]);assert.equal(path.dirname(root),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true,maxRetries:3});}
})().catch(e=>{console.error(e);process.exitCode=1;});
