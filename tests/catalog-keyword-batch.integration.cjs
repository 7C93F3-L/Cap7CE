const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {collectKeywordBatchTargets}=require('../dist-electron/catalogKeywordBatchTargets.js');
const {runKeywordBatch}=require('../dist-electron/catalogKeywordBatchService.js');
const {registerCatalogAutoKeywordIpc}=require('../dist-electron/catalogAutoKeywordIpc.js');
const {fingerprintKeywordSource}=require('../dist-electron/catalogAutoKeywordSource.js');
const {CoreVisualCacheClient}=require('../dist-electron/core/coreVisualCacheClient.js');
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'Cap7CE-keyword-batch-'));
 const sourceClient=new CoreVisualCacheClient(path.join(root,'profile'));
 try{
  const folder=path.join(root,'folder'),nested=path.join(folder,'nested');await fs.mkdir(nested,{recursive:true});
  const make=async(name,dir=false)=>{const file=path.join(root,name);if(!dir)await fs.writeFile(file,'synthetic');const stat=await fs.lstat(file,{bigint:true});
   return {id:name,authorizationId:name,name:path.basename(file),path:file,extension:path.extname(file),isDirectory:dir,volumeId:'V',fileReference:stat.ino.toString(16).padStart(16,'0'),createdFileTimeMilliseconds:String(stat.birthtimeNs/1000000n+11644473600000n)}};
  const a=await make('folder/a.png'),b=await make('folder/nested/b.png'),unsupported=await make('folder/c.txt'),bad=await make('folder/bad.png'),outside=await make('outside.png');
  const directory=await make('folder',true),subdirectory=await make('folder/nested',true),calls=[],cancels=[];
  const runtime={favoriteDirectories:{list:async()=>[{id:'saved',path:folder}]},
   search:async r=>{calls.push(r);return {items:[a,unsupported,outside],nextCursor:'next'}},nextPage:async r=>({items:[b,bad],nextCursor:null}),cancel:async id=>{cancels.push(id);return true}};
  const controller=new AbortController(),discovered=[];
  const collected=await collectKeywordBatchTargets(runtime,{taskId:'selection',authorizationIds:['a','folder']},()=>[a,directory,subdirectory],controller.signal,n=>discovered.push(n));
  assert.equal(calls.length,1,'overlapping directories share one recursive scope');assert.equal(calls[0].scopeKind,'directory-descendants');assert.equal(calls[0].query,'');
  assert.deepEqual(collected.items.map(i=>i.name).sort(),['a.png','b.png','bad.png','c.txt']);assert.equal(collected.skipped,1,'paths escaping the selected physical root are skipped');assert.equal(cancels.length,1);
  let seen=[];const run=async(resolve,signal,progress)=>{const item=resolve();seen.push(item.name);progress('generating');return item.name==='bad.png'?{status:'failed',message:'坏图'}:{status:'saved',added:1,current:{keywords:['tag'],revision:'1'}}};
  const updates=[],result=await runKeywordBatch(async()=>collected,run,controller.signal,p=>updates.push(p));
  assert.deepEqual([result.total,result.processed,result.succeeded,result.failed,result.skipped],[5,5,2,1,2]);assert.deepEqual(seen,['a.png','b.png','bad.png']);assert.equal(result.status,'completed');
  const favorite=await collectKeywordBatchTargets(runtime,{favoriteId:'saved',path:'forged'},()=>{throw Error('must not trust paths')},controller.signal,()=>{});assert.equal(favorite.items.length,4);
  await assert.rejects(collectKeywordBatchTargets(runtime,{favoriteId:'forged'},()=>[],controller.signal,()=>{}),/不存在/);
  for(const driveLetter of ['C:\\','CD','c','../','!'])await assert.rejects(collectKeywordBatchTargets(runtime,{driveLetter},()=>[],controller.signal,()=>{}),/invalid-drive/);
  const driveLetter=path.parse(root).root[0].toUpperCase();await collectKeywordBatchTargets(runtime,{driveLetter,path:'forged'},()=>[],controller.signal,()=>{});
  assert.equal(calls.at(-1).scopePath,driveLetter+':\\','drive batches resolve only a Main-validated volume root');assert.equal(calls.at(-1).scopeKind,'directory-descendants');
  const missing={...directory,path:path.join(root,'missing')};const partial=await collectKeywordBatchTargets(runtime,{taskId:'s',authorizationIds:[]},()=>[missing,a],controller.signal,()=>{});
  assert.equal(partial.failed,1);assert.equal(partial.items.length,1,'one inaccessible folder does not discard other selected files');
  const changed=await collectKeywordBatchTargets(runtime,{taskId:'s',authorizationIds:[]},()=>[{...directory,createdFileTimeMilliseconds:'1'}],controller.signal,()=>{});assert.equal(changed.failed,1);
  await assert.rejects(fingerprintKeywordSource({...a,fileReference:'0000000000000001'},sourceClient.request.bind(sourceClient)),/变化/);
  const abort=new AbortController();let saved=0;const cancelled=await runKeywordBatch(async()=>({...collected,items:[a,b],failed:0,skipped:0}),async()=>{saved++;abort.abort();return {status:'saved',added:1,current:{keywords:[],revision:'1'}}},abort.signal,()=>{});
  assert.equal(saved,1);assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.succeeded,1,'cancellation keeps successful saves and stops the remaining queue');
  let started=0;const fatal=await runKeywordBatch(async()=>({...collected,items:[a,b],failed:0,skipped:0}),async()=>{started++;return {status:'failed',fatal:true,message:'模型未配置'}},controller.signal,()=>{});
  assert.equal(started,1);assert.equal(fatal.status,'failed');assert.equal(fatal.processed,1);
  const handlers=new Map(),sender=new EventEmitter();sender.id=1;sender.isDestroyed=()=>false;sender.send=()=>{};
  let authorized=true,release;const gate=new Promise(r=>release=r),keys={prepare:async()=>{}};
  registerCatalogAutoKeywordIpc({registrar:{handle:(n,f)=>handlers.set(n,f),on:()=>{}},isSenderAllowed:e=>e.allowed,keywords:keys,runtime,
   resolveItem:()=>a,resolveItems:()=>{if(!authorized)throw Error('authorization-expired');return [a,b]},createService:async()=>async(resolve,signal,p)=>{await gate;p('saving');return signal.aborted?{status:'cancelled'}:{status:'saved',added:1,current:{keywords:[],revision:'1'}}}});
  const event={allowed:true,sender},request={requestId:'batch',taskId:'s',authorizationIds:['a','b']};
  await assert.rejects(handlers.get('computerSearch:generateKeywordBatch')({...event,allowed:false},request),/not allowed/);
  const pending=handlers.get('computerSearch:generateKeywordBatch')(event,request);await tick();authorized=false;
  assert.equal((await handlers.get('computerSearch:generateKeywords')(event,{requestId:'single',authorizationId:'a'})).status,'failed','single and batch inference share one owner');
  assert.equal(await handlers.get('computerSearch:cancelGeneratedKeywords')({...event,sender:{id:2}},{requestId:'batch'}),false);
  release();const finished=await pending;assert.equal(finished.succeeded,2,'accepted task survives browsing authorization retirement');assert.equal(sender.listenerCount('destroyed'),0);
  await assert.rejects(handlers.get('computerSearch:generateKeywordBatch')(event,{...request,requestId:'expired'}),/authorization/);
  console.log('Keyword batches: recursive saved scopes, deduplication, identity, scope containment, per-file failures, unsupported files, cancellation, fatal errors, owned IPC and navigation isolation passed.');
 }finally{await sourceClient.releaseSourceHandles();sourceClient.close();await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1});
