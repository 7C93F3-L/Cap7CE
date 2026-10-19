const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createMetadataBuildRuntime}=require('../dist-electron/metadataExtraction/metadataBuildRuntime.js');
const {metadataBuildDelay}=require('../dist-electron/metadataExtraction/metadataBuildProgress.js');
const {createMetadataDirectoryStore,directoryBuildPath}=require('../dist-electron/metadataDirectoryBuildStore.js');
const {registerMetadataBuildIpc}=require('../dist-electron/metadataExtraction/metadataBuildIpc.js');
const volumeId='A'.repeat(32),folder='1'.repeat(16),other='2'.repeat(16);
const globalPolicy={volumeOrder:[volumeId],includes:[{volumeId,rootFileReference:null}],excludes:[]};
const until=async predicate=>{for(let n=0;n<500;n++){if(await predicate())return;await new Promise(r=>setTimeout(r,5))}throw Error('directory-task-timeout')};
function fixture(directoryStore,prior=null){
 let active=false,selected,sequence=0,stored=structuredClone(prior),live=0;
 const control={building:false,block:false,blockGlobal:false,changed:false,maxLive:0,configs:[],reads:[],finished:[],writes:[],resolve:0};
 const rows=[{name:'outside.png',parent:other},{name:'inside.png',parent:folder},{name:'child/nested.png',parent:folder}].map((r,i)=>({...r,id:String(i+1),done:false,queued:false,lease:null}));
 const matches=r=>selected?.includes.some(s=>s.rootFileReference===null||s.rootFileReference===r.parent);
 const protocol={async configure(policy){assert.equal(live,0,'handoff waits for the old extraction');selected=structuredClone(policy);control.configs.push(selected);active=true},
 async pause(){active=false;rows.forEach(r=>r.lease=null)},async consumeChanges(){return {hasMore:false}},
 async discover(){const jobs=rows.filter(r=>matches(r)&&!r.done);jobs.forEach(r=>r.queued=true);return {jobs,next:null}},
 async status(){const jobs=rows.filter(r=>matches(r)&&r.queued&&!r.done);return {state:active?'active':'paused',ledger:{pendingJobs:jobs.filter(r=>!r.lease).length,leasedJobs:jobs.filter(r=>r.lease).length,unavailableVolumeIds:[]}}},
 async claim(){const row=rows.find(r=>matches(r)&&r.queued&&!r.done&&!r.lease);if(!row)return {state:1};row.lease=String(++sequence);return {state:0,ticket:{fullPath:row.name,lease:{leaseId:row.lease,job:{kind:0}}}}},
 task(ticket){return {kind:'image-dimensions',filePath:ticket.fullPath}},async complete(leaseId){const row=rows.find(r=>r.lease===leaseId);if(!row||!active)return 1;row.done=true;row.lease=null;return 0}};
 protocol.execute=async(leaseId,signal)=>{const row=rows.find(r=>r.lease===leaseId);if(!row||!active)return {completion:1,state:null};
  live++;control.maxLive=Math.max(control.maxLive,live);control.reads.push(row.name);try{
   await metadataBuildDelay(control.block||(control.blockGlobal&&selected.includes[0].rootFileReference===null)?10000:2,signal);
   control.finished.push(row.name);return {completion:await protocol.complete(leaseId),state:'indexed'};}finally{live--}};
 const readCatalog=async()=>({volumes:[{volumeId,displayName:'X:',selected:true,queryable:!control.building,state:control.building?'building':'ready'}],tasks:[],catalogRevision:1});
 const create=()=>createMetadataBuildRuntime(protocol,readCatalog,{directoryStore,yieldMs:0,waitMs:2,specifications:[{kind:0,extractorVersion:1,extensions:['.png']}],
 preferences:{async load(){return structuredClone(stored)},async save(v){stored=structuredClone(v);control.writes.push(stored)}},
 resolveScope:async p=>{control.resolve++;if(control.resolveWait)await control.resolveWait;return {resolved:!control.building,queryable:!control.building,volumeId,rootFileReference:control.changed?'3'.repeat(16):p.toLowerCase().endsWith('other')?other:folder,state:control.building?'building':'ready'}}});
 return {create,control,rows,saved:()=>stored};
}
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'Cap7CE-directory-metadata-'));
 try{
  assert.equal(directoryBuildPath('x:/Assets/'),'x:\\Assets');assert.equal(directoryBuildPath('X:\\'),'X:\\');
  for(const p of ['relative','\\\\server\\folder','X:\\a\0','X:\\file:stream'])assert.throws(()=>directoryBuildPath(p));
  const reports=[],blockedFile=path.join(root,'blocked.json');await fs.mkdir(blockedFile);
  const blocked=createMetadataDirectoryStore(blockedFile,error=>reports.push(error));
  await assert.rejects(blocked.save({version:1,intent:'active',jobs:[]}),error=>error.message==='metadata-directory-state-unavailable'&&error.details.operation==='replace'&&!!error.cause);
  assert.equal(reports[0].operation,'replace');assert.equal(JSON.stringify(reports).includes(root),false,'diagnostics contain no paths or raw exception text');
  const corruptFile=path.join(root,'corrupt.json');await fs.writeFile(corruptFile,'invalid JSON');
  await assert.rejects(createMetadataDirectoryStore(corruptFile).load(),error=>error.details.operation==='read'&&error.details.code==='INVALID_STATE');
  assert.equal(await fs.readFile(corruptFile,'utf8'),'invalid JSON','bad records are preserved');
  const store=createMetadataDirectoryStore(path.join(root,'queue.json')),test=fixture(store),runtime=test.create();
  assert.equal((await runtime.status()).progress.phase,'idle');assert.equal(test.control.configs.length,0);
  const handlers=new Map();registerMetadataBuildIpc({handle:(c,h)=>handlers.set(c,h),on(){}},e=>e.allowed,runtime);
  await assert.rejects(handlers.get('metadataBuild:startDirectory')({allowed:false},{path:'X:\\Assets',allowMetadataExtraction:true}));
  await assert.rejects(handlers.get('metadataBuild:startDirectory')({allowed:true},{path:'X:\\Assets',allowMetadataExtraction:false}));
  await Promise.all([runtime.startDirectory({path:'X:\\Assets',allowMetadataExtraction:true}),runtime.startDirectory({path:'x:/Assets/',allowMetadataExtraction:true})]);
  await until(async()=>{const s=await runtime.status();return s.directoryTask?.pending===0&&s.progress.phase==='completed'});
  assert.deepEqual(test.control.finished,['inside.png','child/nested.png'],'only the directory and descendants are read');
  assert.equal(test.control.configs.length,1,'duplicate requests coalesce');assert.equal(test.saved(),null,'directory consent does not overwrite or create global settings');
  await runtime.startDirectory({path:'X:\\Assets',allowMetadataExtraction:true});await until(async()=>(await runtime.status()).directoryTask?.pending===0);
  assert.equal(test.control.finished.length,2,'valid facts are reused');
  await runtime.start({allowMetadataExtraction:true,policy:globalPolicy});await until(()=>test.rows.every(r=>r.done));
  assert.deepEqual(test.control.finished,['inside.png','child/nested.png','outside.png'],'full sweep uses the same completed facts');
  await runtime.shutdown();

  const priority=fixture(createMetadataDirectoryStore(path.join(root,'priority.json'))),p=priority.create();priority.control.blockGlobal=true;
  await p.start({allowMetadataExtraction:true,policy:globalPolicy});await until(()=>priority.control.reads.length===1);
  await p.startDirectory({path:'X:\\Assets',allowMetadataExtraction:true});await until(()=>priority.control.finished.length===2);
  assert.deepEqual(priority.control.finished,['inside.png','child/nested.png'],'directory preempts global work');
  assert.deepEqual(priority.saved().policy,globalPolicy);priority.control.blockGlobal=false;
  await until(()=>priority.rows.every(r=>r.done));assert.equal(priority.control.maxLive,1);await p.shutdown();

  const waitingStore=createMetadataDirectoryStore(path.join(root,'waiting.json')),waiting=fixture(waitingStore),w=waiting.create();waiting.control.building=true;
  await w.startDirectory({path:'X:\\Assets',allowMetadataExtraction:true});await until(async()=>(await w.status()).progress.phase==='waiting');
  assert.equal(waiting.control.configs.length,0,'base preparation does not widen metadata scope');await w.pause();await w.shutdown();
  assert.equal((await waitingStore.load()).intent,'paused');const restored=waiting.create();await restored.restore();
  assert.equal((await restored.status()).progress.phase,'paused');assert.equal(waiting.control.configs.length,0,'restart respects manual pause');
  waiting.control.building=false;await restored.resume();await until(()=>waiting.control.finished.length===2);await restored.shutdown();

  const resumeStore=createMetadataDirectoryStore(path.join(root,'resume.json')),resume=fixture(resumeStore),a=resume.create();resume.control.block=true;
  await a.startDirectory({path:'X:\\Assets',allowMetadataExtraction:true});await until(()=>resume.control.reads.length===1);await a.shutdown();
  assert.equal((await resumeStore.load()).intent,'active','shutdown preserves directory grant');resume.control.block=false;
  const b=resume.create();await b.restore();await until(()=>resume.control.finished.length===2);await b.shutdown();

  const changedStore=createMetadataDirectoryStore(path.join(root,'changed.json')),changed=fixture(changedStore),c=changed.create();changed.control.block=true;
  await c.startDirectory({path:'X:\\Assets',allowMetadataExtraction:true});await until(()=>changed.control.reads.length===1);await c.pause();changed.control.changed=true;changed.control.block=false;
  await c.resume();await until(async()=>(await c.status()).progress.phase==='failed');assert.equal((await c.status()).progress.errorCode,'metadata-directory-changed');
  assert.equal(changed.control.finished.length,0,'recreated path cannot inherit the original directory grant');await c.cancelDirectories();await c.shutdown();

  const broken=fixture({load:async()=>null,save:async()=>{throw Object.assign(Error('private filesystem detail'),{code:'ENOSPC'})}}),d=broken.create();
  await assert.rejects(d.startDirectory({path:'X:\\Assets',allowMetadataExtraction:true}));await d.restore();
  assert.equal(broken.control.configs.length,0,'failed task persistence cannot start extraction');await d.shutdown();
  assert.deepEqual((await d.status()).progress.storageError,{operation:'write',code:'ENOSPC'},'UI receives bounded storage cause, not a guessed permission diagnosis');

  const boundedStore=createMetadataDirectoryStore(path.join(root,'bounded.json')),bounded=fixture(boundedStore),e=bounded.create();bounded.control.building=true;
  for(let i=0;i<32;i++)await e.startDirectory({path:'X:\\Folder'+i,allowMetadataExtraction:true});
  await assert.rejects(e.startDirectory({path:'X:\\Overflow',allowMetadataExtraction:true}),/queue-full/);
  assert.equal((await e.status()).directoryTask.pending,32);await e.cancelDirectories();
  assert.equal((await boundedStore.load()).jobs.length,0);assert.equal(bounded.control.configs.length,0);await e.shutdown();

  const pending=fixture(createMetadataDirectoryStore(path.join(root,'pending.json'))),f=pending.create();let releaseScope;
  pending.control.resolveWait=new Promise(r=>releaseScope=r);
  const late=f.startDirectory({path:'X:\\Assets',allowMetadataExtraction:true});await until(()=>pending.control.resolve===1);
  await f.pause();releaseScope();await assert.rejects(late,/start-cancelled/);assert.equal(pending.control.configs.length,0);await f.shutdown();

  const pausedGrant={version:2,consent:true,intent:'paused',policy:globalPolicy,scopeLabels:{}};
  const paused=fixture(createMetadataDirectoryStore(path.join(root,'global-paused.json')),pausedGrant),g=paused.create();
  await g.startDirectory({path:'X:\\Assets',allowMetadataExtraction:true});await until(()=>paused.control.finished.length===2);
  await until(async()=>!(await g.status()).directoryTask);
  assert.equal((await g.status()).progress.phase,'paused');assert.deepEqual(paused.saved(),pausedGrant,'previously paused global intent stays paused');await g.shutdown();

  let failWrites=false;const underlying=createMetadataDirectoryStore(path.join(root,'pause-failure.json'));
  const pauseFailure=fixture({load:()=>underlying.load(),save:value=>failWrites?Promise.reject(Error('disk full')):underlying.save(value)}),h=pauseFailure.create();
  pauseFailure.control.block=true;await h.startDirectory({path:'X:\\Assets',allowMetadataExtraction:true});await until(()=>pauseFailure.control.reads.length===1);
  failWrites=true;await assert.rejects(h.pause());assert.equal(pauseFailure.control.finished.length,0);
  assert.equal((await h.status()).progress.phase,'failed','pause stops extraction even if its intent cannot be saved');failWrites=false;await h.shutdown();
  console.log('Directory metadata: scoped/recursive reads, shared facts, global handoff, duplicate coalescing, waiting, pause/restart, identity and failed grants passed.');
 }finally{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true})}
})().catch(error=>{console.error(error.stack);process.exitCode=1});
