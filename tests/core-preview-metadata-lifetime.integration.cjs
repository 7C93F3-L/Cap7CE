const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),esbuild=require('esbuild');
const {startCorePreviewMetadataRead}=require('../dist-electron/core/corePreviewMetadataClient.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cap7ce-preview-lifetime-'));let owner,heldWorker;
 try{
  const events=path.join(root,'events.jsonl'),library=path.join(root,'owner.cjs');
  await esbuild.build({entryPoints:['core/node/interactiveMetadata/owner.ts'],outfile:library,bundle:true,platform:'node',format:'cjs',logLevel:'error'});
  await fs.writeFile(path.join(root,'preview-metadata.cjs'),`
const{parentPort,workerData,resourceLimits,threadId}=require('node:worker_threads'),fs=require('node:fs'),path=require('node:path');
const name=path.basename(workerData);fs.appendFileSync(${JSON.stringify(events)},JSON.stringify({name,threadId,limits:resourceLimits})+'\\n');
console.log('parser diagnostics must not enter the cache protocol');console.error('isolated diagnostic');
if(name==='hang')Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);
else if(name==='crash')throw Error('decoder crash');
else setTimeout(()=>parentPort.postMessage(name==='bad'?{items:[],capturedAt:null,extra:true}:name==='sparse'?{items:Array(2),capturedAt:null}:name==='unknown'?{items:[{kind:'untrusted',text:'bad'}],capturedAt:null}:name==='long'?{items:[{kind:'embedded_title',text:'x'.repeat(65537)}],capturedAt:null}:{items:[{kind:'embedded_title',text:name}],capturedAt:null}),name.startsWith('hold')?600:0);
`);
  const {InteractiveMetadataOwner}=require(library);owner=new InteractiveMetadataOwner(root,3000);
  const rows=async()=>{try{return(await fs.readFile(events,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse)}catch(error){if(error.code==='ENOENT')return[];throw error}};
  const until=async predicate=>{for(let i=0;i<150;i++){if(await predicate())return;await sleep(10)}throw Error('preview test timeout')};
  const read=name=>owner.read(name,path.join(root,name));
  const first=read('hold-first'),second=read('hold-second'),queued=read('queued'),last=read('last');
  assert.equal(await read('overflow'),null);await until(async()=>(await rows()).length===2);
  assert.ok((await rows()).every(row=>row.limits.maxOldGenerationSizeMb===256&&row.limits.stackSizeMb===4));
  await owner.cancel('queued');assert.equal(await queued,null);await owner.cancel('hold-first');assert.equal(await first,null);
  assert.equal((await last).items[0].text,'last');assert.equal((await second).items[0].text,'hold-second');
  assert.equal((await rows()).some(row=>row.name==='queued'),false,'queued cancellation never reads a source');
  for(const name of['bad','sparse','unknown','long','crash'])assert.equal(await read(name),null);
  assert.equal((await read('recovered')).items[0].text,'recovered');
  const held=read('hang');await until(async()=>(await rows()).some(row=>row.name==='hang'));await owner.release();assert.equal(await held,null);
  assert.equal((await read('after-release')).items[0].text,'after-release');
  const budget=new InteractiveMetadataOwner(root,150);assert.equal(await budget.read('budget',path.join(root,'hang')),null);await budget.release();budget.close();
  const closing=[owner.read('close-a',path.join(root,'hang')),owner.read('close-b',path.join(root,'hang')),owner.read('close-q',path.join(root,'never-read'))];
  owner.close();assert.deepEqual(await Promise.all(closing),[null,null,null]);await owner.release();assert.equal(await read('after-close'),null);
  assert.equal((await rows()).some(row=>row.name==='never-read'),false,'EOF closes queued jobs without opening their sources');

  let requests=0,cancels=0,reply;
  const transport={request:async()=>{requests++;return new Promise(r=>reply=r)},cancel:async()=>{cancels++;return null}};
  const early=startCorePreviewMetadataRead(path.join(root,'early'),1000,transport);early.cancel();assert.equal(await early.result,null);await sleep(5);assert.equal(requests,0);
  const active=startCorePreviewMetadataRead(path.join(root,'active'),1000,transport);await until(()=>requests===1);active.cancel();active.cancel();assert.equal(await active.result,null);assert.equal(cancels,1);
  reply({items:[{kind:'embedded_title',text:'late'}],capturedAt:null});await sleep(5);assert.equal(await active.result,null);
  const timeout=startCorePreviewMetadataRead(path.join(root,'timeout'),30,transport);assert.equal(await timeout.result,null);assert.equal(cancels,2);
  const invalid=startCorePreviewMetadataRead(path.join(root,'invalid'),1000,{request:async()=>({items:[],capturedAt:null,extra:true}),cancel:transport.cancel});assert.equal(await invalid.result,null);
  // Run the real read-only wrapper around a held parser, then replace an identically sized/timed fixture.
  const staleWorker=path.join(root,'stale.cjs'),source=path.join(root,'source.jpg'),ready=path.join(root,'source-ready'),resume=path.join(root,'source-resume');
  await fs.writeFile(source,'before');await fs.utimes(source,1700000000,1700000000);
  await esbuild.build({entryPoints:['core/node/interactiveMetadata/worker.ts'],outfile:staleWorker,bundle:true,platform:'node',format:'cjs',logLevel:'error',
   plugins:[{name:'held-parser',setup(build){build.onLoad({filter:/embeddedMetadataExtractor\.ts$/},()=>({contents:`
export async function extractEmbeddedMetadata(){const fs=require('node:fs/promises');await fs.writeFile(${JSON.stringify(ready)},'ready');
while(true){try{await fs.access(${JSON.stringify(resume)});break}catch{await new Promise(r=>setTimeout(r,5))}}
return{status:'indexed',evidence:[{kind:'embedded_title',searchText:'obsolete'}],capturedAt:null}}
`,loader:'ts'}))}}]});
  const {Worker}=require('node:worker_threads'),stale=heldWorker=new Worker(staleWorker,{workerData:source});
  const staleResult=new Promise((resolve,reject)=>{stale.once('message',resolve);stale.once('error',reject)});
  await until(async()=>{try{await fs.access(ready);return true}catch{return false}});
  await fs.rename(source,source+'.old');await fs.writeFile(source,'after!');await fs.utimes(source,1700000000,1700000000);await fs.writeFile(resume,'resume');
  assert.equal(await staleResult,null,'replaced physical source cannot publish metadata with the same size/time');await stale.terminate();
  console.log('Core preview lifetime: two active/two queued, exact cancellation, real Worker termination, 256MiB heap, timeouts/crashes/bad replies, release barrier, quiet parser streams and stale Shell results passed.');
 }finally{
  await heldWorker?.terminate();
  if(owner){owner.close();await owner.release()}
  assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('cap7ce-preview-lifetime-'));await fs.rm(root,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
