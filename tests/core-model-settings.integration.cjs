const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),esbuild=require('esbuild');
(async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'cap7ce-core-model-settings-'));try{
 const output=path.join(root,'owner.cjs');await esbuild.build({entryPoints:[path.resolve('core/node/modelSettings/owner.ts')],bundle:true,platform:'node',format:'cjs',outfile:output});
 const user=path.join(root,'profile'),runtimeRoot=path.join(root,'llama.cpp'),modelsRoot=path.join(root,'models');
 const context={runtimeRoot,modelsRoot,language:'zh-CN'},owner=require(output).createModelSettingsOwner(user);
 const invoke=(op,value=null,ctx=context)=>owner.dispatch([ctx,op,value]);
 assert.equal((await invoke('runtime.settings')).status,'missing_root');assert.equal((await invoke('models.settings')).status,'missing_directory');
 await assert.rejects(fs.stat(user),{code:'ENOENT'});
 for(const version of ['b10','b2','b1']){await fs.mkdir(path.join(runtimeRoot,version),{recursive:true});await fs.writeFile(path.join(runtimeRoot,version,'llama-server.exe'),'generated executable sentinel');}
 await fs.mkdir(path.join(modelsRoot,'嵌套'),{recursive:true});
 const sources=['qwen-test-q4.gguf','mmproj-qwen-test-f16.gguf','嵌套/other-model.gguf'];for(const name of sources)await fs.writeFile(path.join(modelsRoot,name),'generated model sentinel');
 const hashes=await Promise.all(sources.map(async name=>crypto.createHash('sha256').update(await fs.readFile(path.join(modelsRoot,name))).digest('hex')));
 assert.deepEqual((await invoke('runtime.settings')).versions.map(v=>v.version),['b1','b2','b10']);
 let models=await invoke('models.settings');assert.equal(models.models.length,2);assert.equal(models.models.find(v=>v.id==='qwen-test-q4.gguf').loadable,true);
 await Promise.all([invoke('runtime.select','b10'),invoke('runtime.select','b2')]);assert.equal((await invoke('runtime.settings')).selectedVersion,'b2');
 await invoke('models.select','QWEN-TEST-Q4.GGUF');assert.equal(await invoke('models.selectedId'),'qwen-test-q4.gguf');
 const selected=await invoke('models.selectedRuntime');assert.equal(selected.modelPath,path.join(modelsRoot,sources[0]));assert.equal(selected.mmprojPath,path.join(modelsRoot,sources[1]));
 const runtimeFile=path.join(user,'config','llama-runtime.json'),modelFile=path.join(user,'config','gguf-model.json'),before=await fs.readFile(runtimeFile,'utf8');
 await assert.rejects(invoke('runtime.select','../escape'));assert.equal(await fs.readFile(runtimeFile,'utf8'),before);
 await assert.rejects(invoke('models.select','missing'));await assert.rejects(invoke('model.invalid'));
 await assert.rejects(invoke('runtime.settings',null,{...context,runtimeRoot:path.join(root,'other')}),/invalid-request/);
 await assert.rejects(owner.dispatch([{...context,unexpected:true},'runtime.settings',null]),/invalid-request/);
 await invoke('runtime.select','');await invoke('models.select','  ');assert.equal((await invoke('runtime.settings')).status,'unselected');assert.equal((await invoke('models.settings')).selectedModelId,'');
 const archived=modelFile+'.saved';await fs.rename(modelFile,archived);await fs.mkdir(modelFile);await fs.writeFile(path.join(modelFile,'retained'),'retained directory marker');
 const foreignStage=modelFile+'.tmp';await fs.writeFile(foreignStage,'retained previous stage');await assert.rejects(invoke('models.select',''));
 assert.equal(await fs.readFile(path.join(modelFile,'retained'),'utf8'),'retained directory marker');assert.equal(await fs.readFile(foreignStage,'utf8'),'retained previous stage');
 assert.deepEqual((await fs.readdir(path.dirname(modelFile))).filter(n=>n.endsWith('.tmp')),['gguf-model.json.tmp']);
 assert.equal(path.dirname(path.dirname(modelFile)),path.resolve(user));await fs.rm(modelFile,{recursive:true});await fs.rename(archived,modelFile);
 await fs.writeFile(modelFile,' '.repeat(1024*1024+1));await assert.rejects(invoke('models.settings'),/too-large/);assert.equal((await fs.stat(modelFile)).size,1024*1024+1);
 await fs.writeFile(modelFile,'{malformed');await assert.rejects(invoke('models.settings'));assert.equal(await fs.readFile(modelFile,'utf8'),'{malformed');
 assert.deepEqual(await Promise.all(sources.map(async name=>crypto.createHash('sha256').update(await fs.readFile(path.join(modelsRoot,name))).digest('hex'))),hashes);
 const english=await invoke('runtime.settings',null,{...context,language:'en-US'});assert.match(english.message,/select/i);
 const serviceRoot=path.join(root,'service');await fs.mkdir(serviceRoot);
 await require('./model-runtime-fixture.cjs')(serviceRoot);
 const apiFile=path.join(root,'runtime-api.cjs');await esbuild.build({entryPoints:[path.resolve('core/node/modelRuntime/api.ts')],bundle:true,platform:'node',format:'cjs',outfile:apiFile});
 const service=require(apiFile).createLocalModelService(path.join(serviceRoot,'profile'),{idleTimeoutMs:80,healthIntervalMs:10000});
 const serviceContext={runtimeRoot:path.join(serviceRoot,'llama.cpp'),modelsRoot:path.join(serviceRoot,'models'),language:'zh-CN'};
 await fs.mkdir(serviceContext.modelsRoot);for(const name of ['qwen-test-q4.gguf','mmproj-qwen-test-f16.gguf'])await fs.writeFile(path.join(serviceContext.modelsRoot,name),'generated model fixture');
 const call=(method,value=null)=>service.dispatch(method,[serviceContext,value]),quiescent=()=>service.dispatch('runtime.idle',[]);
 try{
  assert.equal(await quiescent(),true);
  await service.dispatch('modelSettings.invoke',[serviceContext,'runtime.select','b-test']);
  await service.dispatch('modelSettings.invoke',[serviceContext,'models.select','qwen-test-q4.gguf']);
  await call('runtime.beginAI');assert.equal(await quiescent(),false,'AI reference protects a cold model host');
  await call('runtime.endAI');assert.equal(await quiescent(),true);
  assert.equal((await call('runtime.start','manual')).state.status,'running');
  await call('runtime.beginAI');await call('runtime.endAI');await new Promise(resolve=>setTimeout(resolve,180));
  assert.equal((await call('runtime.state')).state.status,'running','manual runtime survives AI idle window');
  assert.equal(await quiescent(),false,'live manual process blocks retirement');
  await call('runtime.stop','fixture stop');assert.equal(await quiescent(),true);
  await call('runtime.beginAI');assert.equal((await call('runtime.start','ai')).state.status,'running');
  await call('runtime.endAI');assert.equal(await quiescent(),false,'AI grace period and owned process block retirement');
  for(let n=0;n<100&&(await call('runtime.state')).state.status!=='stopped';n++)await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal((await call('runtime.state')).state.status,'stopped');assert.equal(await quiescent(),true);
 }finally{await service.close();}
 console.log('Core model settings: passive read, existing numeric ordering/pairing, case-normalized selection, serialized writes, fixed roots, corrupt-file preservation, language parity and unchanged generated sources passed.');
 }finally{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
