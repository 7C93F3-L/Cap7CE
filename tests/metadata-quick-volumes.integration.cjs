const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createMetadataBuildRuntime}=require('../dist-electron/metadataExtraction/metadataBuildRuntime.js');
const {createMetadataDirectoryStore}=require('../dist-electron/metadataDirectoryBuildStore.js');
const {registerMetadataBuildIpc}=require('../dist-electron/metadataExtraction/metadataBuildIpc.js');
const ids=['A','B','C'].map(c=>c.repeat(32)),folder='1'.repeat(16);
const until=async predicate=>{for(let i=0;i<500;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,5))}throw Error('quick-volume-timeout')};
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'Cap7CE-quick-volumes-'));
 try{
  let building=false,changed=false,writes=0,fail=false,blockRead,releaseRead;
  const configurations=[],grant={version:2,consent:false,intent:'configured',policy:{volumeOrder:[ids[1]],includes:[{volumeId:ids[1],rootFileReference:folder}],excludes:[{volumeId:ids[1],rootFileReference:'2'.repeat(16)}]},scopeLabels:{}};
  const catalog=()=>({volumes:ids.map((volumeId,i)=>({volumeId,displayName:['X:','Y:','Z:'][i],selected:true,queryable:i<2&&!building,state:i===2?'offline':building?'building':'ready'})),tasks:[],catalogRevision:1});
  const protocol={configure:async policy=>configurations.push(structuredClone(policy)),pause:async()=>{},consumeChanges:async()=>({hasMore:false}),
   discover:async()=>({jobs:[],next:null}),claim:async()=>({state:1}),status:async()=>({state:'active',ledger:{pendingJobs:0,leasedJobs:0,unavailableVolumeIds:[]}})};
  const store=createMetadataDirectoryStore(path.join(root,'queue.json'));
  const create=()=>createMetadataBuildRuntime(protocol,async()=>{if(blockRead)await blockRead;return catalog()},
   {directoryStore:{load:()=>store.load(),save:value=>fail?Promise.reject(Error('disk-full')):store.save(value)},preferences:{load:async()=>structuredClone(grant),save:async()=>{writes++}},yieldMs:0,waitMs:2,
    specifications:[{kind:0,extractorVersion:1,extensions:['.png']}],workerFactory:()=>{throw Error('No content jobs in this fixture')},
    resolveScope:async p=>({resolved:!building,queryable:!building,volumeId:changed?ids[2]:p[0]==='X'?ids[0]:ids[1],rootFileReference:null,state:building?'building':'ready'})});
  const runtime=create(),handlers=new Map();registerMetadataBuildIpc({handle:(c,h)=>handlers.set(c,h),on(){}},e=>e.main||e.settings,runtime,{isDirectorySenderAllowed:e=>e.main});
  await runtime.status();assert.equal(configurations.length,0);
  await assert.rejects(handlers.get('metadataBuild:startAllVolumes')({settings:true},{allowMetadataExtraction:true}),/not allowed/);
  await assert.rejects(handlers.get('metadataBuild:startAllVolumes')({main:true},{allowMetadataExtraction:false}),/confirmation/);
  await handlers.get('metadataBuild:startAllVolumes')({main:true},{allowMetadataExtraction:true,paths:['Z:\\malicious'],policy:grant.policy});
  await until(async()=>(await store.load()).jobs.length===0&&configurations.length===2);
  assert.deepEqual(configurations.map(p=>p.volumeOrder),[[ids[0]],[ids[1]]],'all available drives, regardless of the saved custom selection');
  for(const policy of configurations){assert.equal(policy.includes[0].rootFileReference,null);assert.deepEqual(policy.excludes,[])}
  assert.deepEqual((await runtime.status()).policy,grant.policy);assert.equal(writes,0,'quick all-drive consent never replaces the saved custom policy');await runtime.shutdown();
  building=true;const waiting=create();await waiting.startAllVolumes({allowMetadataExtraction:true});await until(async()=>(await waiting.status()).progress.phase==='waiting');
  await waiting.startAllVolumes({allowMetadataExtraction:true});assert.equal((await store.load()).jobs.length,2,'repeat actions coalesce roots');
  await waiting.pause();await waiting.shutdown();const restored=create();await restored.restore();
  assert.equal((await restored.status()).progress.phase,'paused');assert.equal(configurations.length,2,'restart respects the manual pause');
  building=false;await restored.resume();await until(async()=>(await store.load()).jobs.length===0&&configurations.length===4);await restored.shutdown();
  fail=true;const failed=create();await assert.rejects(failed.startAllVolumes({allowMetadataExtraction:true}));
  assert.equal(configurations.length,4,'failed task persistence cannot start extraction');fail=false;await failed.cancelDirectories();await failed.shutdown();
  building=true;const reassigned=create();await reassigned.startAllVolumes({allowMetadataExtraction:true});await until(async()=>(await reassigned.status()).progress.phase==='waiting');
  await reassigned.pause();building=false;changed=true;await reassigned.resume();await until(async()=>(await reassigned.status()).progress.phase==='failed');
  assert.equal((await reassigned.status()).progress.errorCode,'metadata-directory-changed','a reassigned drive does not inherit consent');await reassigned.cancelDirectories();await reassigned.shutdown();
  changed=false;const cancelled=create();blockRead=new Promise(resolve=>{releaseRead=resolve});
  const late=cancelled.startAllVolumes({allowMetadataExtraction:true});await new Promise(r=>setTimeout(r,10));
  await cancelled.pause();releaseRead();await assert.rejects(late,/start-cancelled/);blockRead=null;assert.equal((await store.load()).jobs.length,0);await cancelled.shutdown();
  assert.equal(writes,0);console.log('Quick all-drive metadata: explicit Main consent, available roots, custom-policy preservation, deduplication, pause/restart, persistence failure and identity/cancellation fences passed.');
 }finally{await fs.rm(root,{recursive:true,force:true})}
})().catch(error=>{console.error(error.stack);process.exitCode=1});
