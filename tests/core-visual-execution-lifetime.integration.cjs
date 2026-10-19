const assert=require('node:assert/strict'),fs=require('node:fs/promises'),fsSync=require('node:fs'),path=require('node:path'),os=require('node:os');
const {build}=require('esbuild');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const alive=pid=>{try{process.kill(pid,0);return true}catch{return false}};
const waitFor=async predicate=>{for(let attempt=0;attempt<100;attempt++){if(await predicate())return;await sleep(20)}throw Error('fixture lifetime timeout')};
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cap7ce-visual-lifetime-')),owners=[],coordinators=[];
 try{
  const library=path.join(root,'owner.cjs'),preparation=path.join(root,'preparation.cjs'),storeLibrary=path.join(root,'store.cjs');
  for(const[source,outfile]of[['core/node/visualRendering/owner.ts',library],['core/node/visualRendering/preparation.ts',preparation],['core/node/visualCache/store.ts',storeLibrary]])
   await build({entryPoints:[path.resolve(source)],outfile,bundle:true,platform:'node',format:'cjs',logLevel:'error'});
  const {VisualExecutionOwner}=require(library),{CoreVisualPreparation}=require(preparation);
  const worker=path.join(root,'visual-render.cjs'),events=path.join(root,'events.jsonl');
  await fs.writeFile(worker,`const fs=require('fs'),path=require('path');let input=Buffer.alloc(0);
const reply=value=>{const p=Buffer.from(JSON.stringify(value)),h=Buffer.alloc(4);h.writeUInt32LE(p.length);process.stdout.write(Buffer.concat([h,p]))};
process.stdin.on('data',chunk=>{input=Buffer.concat([input,chunk]);while(input.length>=4&&input.length>=4+input.readUInt32LE()){
const n=input.readUInt32LE(),r=JSON.parse(input.subarray(4,4+n));input=input.subarray(4+n);const name=path.basename(r.task.sourcePath);
fs.writeFileSync(path.join(process.env.CAP7CE_VISUAL_SCRATCH,'owned.tif'),'owned');fs.appendFileSync(${JSON.stringify(events)},JSON.stringify({name,pid:process.pid,scratch:process.env.CAP7CE_VISUAL_SCRATCH})+'\\n');
if(name==='hang')continue;if(name==='crash'){process.exit(1)}if(name==='bad'){process.stdout.write(Buffer.from([255,255,255,127]));continue}
const result=r.task.operation==='decode'?{kind:'image',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',mimeType:'image/png'}:{kind:'dimensions',value:{width:1,height:1}};if(name==='extra')result.unexpected=true;if(name==='fractional')result.value.width=1.5;
if(name==='held'){let watcher;const resume=()=>{if(fs.existsSync(path.join(path.dirname(r.task.sourcePath),'continue'))){watcher.close();reply({id:r.id,result,rssBytes:10})}};watcher=fs.watch(path.dirname(r.task.sourcePath),resume);resume();continue}
setTimeout(()=>reply({id:r.id,result,rssBytes:name==='rss'?900*1024*1024:10}),name==='slow'?100:0);
}});`);
  const open=(timeout=1000,idle=5000)=>{const owner=new VisualExecutionOwner(root,timeout,idle);owners.push(owner);return owner};
  const task=name=>({operation:'dimensions',sourcePath:path.join(root,name)});
  const rows=async()=>{try{return(await fs.readFile(events,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line))}catch{return[]}};
  const retired=async row=>{await waitFor(()=>!alive(row.pid));await waitFor(async()=>{try{await fs.access(row.scratch);return false}catch{return true}})};

  const queued=open();const before=(await rows()).length,first=queued.execute(task('held')),second=queued.execute(task('held')),third=queued.execute(task('queued-third'));
  await waitFor(async()=>(await rows()).length>=before+2);
  let released=false;const barrier=queued.release().then(()=>{released=true});await sleep(20);assert.equal(released,false,'flush waits for admitted decodes');
  assert.equal((await rows()).length,before+2,'a third decode waits for one of two slots');await fs.writeFile(path.join(root,'continue'),'yes');
  await Promise.all([first,second,third,barrier]);for(const row of(await rows()).slice(before))await retired(row);

  const cancelled=open(),count=(await rows()).length,pending=cancelled.execute(task('must-not-start'));cancelled.close();
  await assert.rejects(pending,error=>error.code==='ECANCELED');await sleep(25);assert.equal((await rows()).length,count,'close before start cannot dispatch a source');

  const failed=open(),original=fsSync.mkdtempSync;fsSync.mkdtempSync=()=>{throw Object.assign(new Error('fixture disk full'),{code:'ENOSPC'})};
  try{await assert.rejects(failed.execute(task('no-scratch')),error=>error.code==='ENOSPC');await failed.release()}finally{fsSync.mkdtempSync=original}
  assert.deepEqual(await failed.execute(task('after-disk-recovery')),{kind:'dimensions',value:{width:1,height:1}});await failed.release();

  const bounded=open(150);const at=(await rows()).length;
  await assert.rejects(bounded.execute(task('hang')),error=>error.code==='ETIMEDOUT');await bounded.release();
  const hung=(await rows()).slice(at).find(row=>row.name==='hang');assert.ok(hung);await retired(hung);
  for(const name of['crash','bad','extra','fractional']){
   await assert.rejects(bounded.execute(task(name)),/core-visual-worker/);await bounded.release();
   assert.deepEqual(await bounded.execute(task('recovered')),{kind:'dimensions',value:{width:1,height:1}});await bounded.release();
  }

  const reuse=open(1000,80);await reuse.execute(task('warm-one'));await new Promise(resolve=>setImmediate(resolve));
  await reuse.execute(task('warm-two'));const warm=(await rows()).filter(row=>/^warm-/.test(row.name));assert.equal(warm[0].pid,warm[1].pid,'reuse between visible requests');
  await retired(warm[1]);await reuse.execute(task('rss'));await new Promise(resolve=>setImmediate(resolve));await reuse.execute(task('after-rss'));
  const rss=(await rows()).find(row=>row.name==='rss'),afterRss=(await rows()).find(row=>row.name==='after-rss');assert.notEqual(rss.pid,afterRss.pid);await reuse.release();

  // Preparation must track metadata-await work too, before it reaches the decoder pool.
  let metadataGate,flushDone=false;const gate=new Promise(resolve=>metadataGate=resolve);
  const fakeStore={initializeVisualCacheDirectories:async()=>{},createVisualCacheEntry:async()=>{await gate;return{imagePath:path.join(root,'cached.png'),fileSize:1,modifiedMs:2}},isVisualCacheEntryValid:async()=>true};
  const coordinator=new CoreVisualPreparation(fakeStore,root),preparing=coordinator.ensure(path.join(root,'source.png'),'skim-thumbnail',false);
  const flushing=coordinator.release().then(()=>{flushDone=true});await sleep(20);assert.equal(flushDone,false,'flush includes admitted metadata lookup');
  metadataGate();await Promise.all([preparing,flushing]);coordinator.close();

  // Real cache publication must reject an already running decoder's result after a clear.
  await fs.rm(path.join(root,'continue'));const source=path.join(root,'held');await fs.writeFile(source,'generated-source');
  const store=require(storeLibrary).createVisualCacheStore(path.join(root,'profile')),actual=new CoreVisualPreparation(store,root);coordinators.push(actual);
  const admitted=(await rows()).length,obsolete=actual.ensure(source,'skim-thumbnail',false);void obsolete.catch(()=>undefined);
  await waitFor(async()=>(await rows()).length>admitted);await store.clearSkimVisualCaches();await fs.writeFile(path.join(root,'continue'),'yes');
  await assert.rejects(obsolete,error=>error.code==='ECANCELED');assert.equal((await store.getSkimVisualCacheStats()).cacheCount,0);
  await actual.ensure(source,'skim-thumbnail',false);assert.equal((await store.getSkimVisualCacheStats()).cacheCount,1);await actual.release();
  assert.equal(await fs.readFile(source,'utf8'),'generated-source');
  console.log('Core visual lifetime: two-slot bound, metadata/read flush, close-before-start, synchronous temp failure, timeout/crash/malformed response, idle/RSS retirement and exact owned-scratch cleanup passed.');
 }finally{
  for(const owner of owners)owner.close();
  for(const coordinator of coordinators)coordinator.close();
  try{const rows=(await fs.readFile(path.join(root,'events.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
   for(const row of rows)await waitFor(async()=>{try{await fs.access(row.scratch);return false}catch{return true}});
  }catch(error){if(error.code!=='ENOENT')throw error}
  assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('cap7ce-visual-lifetime-'));await fs.rm(root,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
