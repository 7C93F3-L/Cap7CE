const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{randomUUID}=require('node:crypto');
const transportFor=require('./core-stored-index-transport.cjs');
const {createCoreFolderStatsTask,inspectCoreSource}=require('../dist-electron/core/coreSourceInformationClient.js');
const empty={fileCount:0,folderCount:0,totalSize:0,skippedCount:0,status:'scanning'};
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cap7ce-source-info-')),transport=transportFor(path.join(root,'profile'));
 try{
  const source=path.join(root,'source'),outside=path.join(root,'outside');await fs.mkdir(path.join(source,'nested'),{recursive:true});await fs.mkdir(outside);
  await fs.writeFile(path.join(source,'one.txt'),'one');await fs.writeFile(path.join(source,'nested','two.bin'),'12345');await fs.writeFile(path.join(outside,'untouched.txt'),'external');
  const before=await fs.stat(path.join(source,'one.txt'));await fs.symlink(outside,path.join(source,'linked'),'junction');
  assert.equal((await inspectCoreSource(source,'folder',[root],transport)).withinAddedDirectory,true);await assert.rejects(inspectCoreSource(path.join(source,'one.txt'),'folder',[],transport),/type changed/);
  const progress=[],task=createCoreFolderStatsTask({path:source},{progressIntervalMs:0},transport);
  assert.deepEqual(await task.collect(s=>progress.push(s)),{fileCount:2,folderCount:1,totalSize:8,skippedCount:0,status:'completed'});assert.equal(progress.at(-1).status,'completed');
  const ids=Array.from({length:4},()=>randomUUID());for(const id of ids)await transport.request('sourceInfo.start',[id,source,{}]);await assert.rejects(transport.request('sourceInfo.start',[randomUUID(),source,{}]),/busy/);
  for(const id of ids){let state=await transport.request('sourceInfo.watch',[id,0]);while(!state.done)state=await transport.request('sourceInfo.watch',[id,state.sequence]);assert.equal(state.stats.totalSize,8);}
  await transport.request('releaseSourceHandles',[]);for(const id of ids)await assert.rejects(transport.request('sourceInfo.watch',[id,0]),/invalid-request/);
  const cancelled=createCoreFolderStatsTask({path:source},{},transport);cancelled.cancelled=true;assert.equal((await cancelled.collect(()=>{})).status,'cancelled');
  assert.equal((await fs.stat(path.join(source,'one.txt'))).mtimeMs,before.mtimeMs);assert.equal(await fs.readFile(path.join(outside,'untouched.txt'),'utf8'),'external');
  await assert.rejects(fs.access(path.join(root,'profile')),'metadata-only requests do not create caches or user data');
  let resolveWatch,finished=false,cancelCalls=0,releaseCalls=0;const fake={request:async(method)=>method==='sourceInfo.start'?{sequence:0,done:false,stats:empty}:new Promise(resolve=>{resolveWatch=resolve}),cancel:async(method)=>{if(method==='sourceInfo.cancel')cancelCalls++;if(method==='sourceInfo.release')releaseCalls++;return null}};
  const held=createCoreFolderStatsTask({path:source},{},fake),work=held.collect(()=>{}).then(value=>{finished=true;return value});while(!resolveWatch)await new Promise(resolve=>setImmediate(resolve));held.cancelled=true;await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false,'cancel waits for Core completion');assert.equal(cancelCalls,1);
  resolveWatch({sequence:1,done:true,stats:{...empty,status:'cancelled'}});assert.equal((await work).status,'cancelled');assert.equal(releaseCalls,1);
  assert.equal((await createCoreFolderStatsTask({path:source},{},{request:async()=>{throw Error('host stopped')},cancel:async()=>null}).collect(()=>{throw Error('retired UI')})).status,'cancelled');
  console.log('Source information: actual Core Job/RPC, unchanged sources, link exclusion, progress, four-task quota, release barrier, passive cancellation and retired-view errors passed.');
 }finally{transport.close();await new Promise(resolve=>setTimeout(resolve,150));assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('cap7ce-source-info-'));await fs.rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:50});}
})().catch(error=>{console.error(error);process.exitCode=1});
