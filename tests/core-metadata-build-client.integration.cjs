const assert=require('node:assert/strict');
const {CoreMetadataBuildClient}=require('../dist-electron/core/coreMetadataBuildClient.js');
const {readMetadataBuildStatus}=require('../dist-electron/core/coreMetadataBuildValidation.js');
const volume='a'.repeat(32),policy={volumeOrder:[volume],includes:[{volumeId:volume,rootFileReference:null}],excludes:[]};
const status=()=>({progress:{phase:'idle',volumeId:null,discovered:0,processed:0,failed:0,unsupported:0,total:null,progressFraction:null,remainingSeconds:null,errorCode:null},volumes:[{volumeId:volume,label:'X:'}],policy:structuredClone(policy),scopeLabels:{}});
const reply=result=>({result,errorCode:null});const deferred=()=>{let resolve,reject;const work=new Promise((a,b)=>{resolve=a;reject=b});return{work,resolve,reject}};
function fixture(){let pid=11,active=true;const calls=[],reports=[];let ensures=0;
 const test={calls,reports,setPid:value=>{pid=value},setActive:value=>{active=value},ensures:()=>ensures,
  respond:async(op,body)=>reply(op.endsWith('.attach')?{attached:true}:['.notify','.restore','.shutdown'].some(t=>op.endsWith(t))?{accepted:true}:op.endsWith('.resolveScope')?{volumeId:volume,rootFileReference:null,label:body.path}:status())};
 test.client=new CoreMetadataBuildClient({ensureCatalog:async()=>{ensures++},processId:()=>pid,active:()=>active,supports:()=>true,reportStorageError:error=>reports.push(error),
  request:async(op,body,deadline)=>{calls.push({op,body,deadline,pid});return test.respond(op,body)}});return test;
}
async function until(check){for(let step=0;step<500;step++){if(check())return;await new Promise(r=>setTimeout(r,2))}throw Error('client test timeout')}
(async()=>{
 let t=fixture();await t.client.notifyCatalogChange();await t.client.shutdown();await t.client.shutdown();assert.equal(t.calls.length,0);assert.equal(t.ensures(),0,'passive cleanup never starts Core');
 t=fixture();await Promise.all([t.client.status(),t.client.status(),t.client.status()]);assert.equal(t.calls.filter(c=>c.op.endsWith('.attach')).length,1,'one attach per actual process');
 await t.client.savePolicy(policy);await t.client.start({allowMetadataExtraction:true,policy});await t.client.pause();await t.client.resume();
 await t.client.startDirectory({path:'X:\\Assets',allowMetadataExtraction:true});await t.client.startAllVolumes({allowMetadataExtraction:true});await t.client.cancelDirectories();
 assert.equal((await t.client.resolveScope('X:\\')).label,'X:\\');assert.deepEqual(t.calls.find(c=>c.op.endsWith('.savePolicy')).body,{policy});
 assert.ok(t.calls.every(c=>c.op.startsWith('metadata.build.')),'no low-level discovery or source execution remains in the Shell client');
 const ensureCount=t.ensures();await t.client.notifyCatalogChange();assert.equal(t.ensures(),ensureCount,'wake does not bootstrap or recursively re-read Catalog');
 t.setActive(false);await Promise.all([t.client.shutdown(),t.client.shutdown()]);assert.equal(t.calls.filter(c=>c.op.endsWith('.shutdown')).length,1,'shutdown remains effective after Shell marks itself stopping');
 t=fixture();const restore=deferred(),base=t.respond;t.respond=(op,body)=>op.endsWith('.restore')?restore.work:base(op,body);
 const a=t.client.restore(),b=t.client.restore();assert.equal(a,b);await until(()=>t.calls.some(c=>c.op.endsWith('.restore')));restore.resolve(reply({accepted:true}));await a;
 t=fixture();await t.client.status();const late=deferred(),normal=t.respond;t.respond=(op,body)=>op.endsWith('.status')?late.work:normal(op,body);
 const pending=t.client.status();await until(()=>t.calls.filter(c=>c.op.endsWith('.status')).length===2);t.setPid(22);late.resolve(reply(status()));await assert.rejects(pending,/start-cancelled/);
 t.respond=normal;await t.client.status();assert.equal(t.calls.filter(c=>c.op.endsWith('.attach')).length,2,'replacement process attaches independently');
 t=fixture();let badAttach=true;const defaultReply=t.respond;t.respond=(op,body)=>op.endsWith('.attach')&&badAttach?Promise.resolve(reply({attached:false})):defaultReply(op,body);
 await assert.rejects(t.client.status(),/invalid-response/);badAttach=false;await t.client.status();assert.equal(t.calls.filter(c=>c.op.endsWith('.attach')).length,2,'failed idempotent attach can be retried without replaying mutation');
 for(const edit of [s=>s.progress.processed=-1,s=>s.progress.phase='other',s=>s.progress.remainingSeconds=Infinity,s=>s.directoryTask={path:'X:\\',pending:33},s=>s.scopeLabels={bad:'X:\\'},s=>s.volumes=Array(1),s=>s.policy.volumeOrder=Array(1)]){
  const value=status();edit(value);assert.throws(()=>readMetadataBuildStatus(value),/invalid-response/);
 }
 t=fixture();await t.client.status();t.respond=async()=>({result:null,errorCode:'metadata-directory-state-unavailable',storageError:{operation:'write',code:'ENOSPC'}});
 await assert.rejects(t.client.startDirectory({path:'X:\\',allowMetadataExtraction:true}),e=>e.message==='metadata-directory-state-unavailable'&&e.details.code==='ENOSPC');
 assert.deepEqual(t.reports,[{operation:'write',code:'ENOSPC'}]);
 t.respond=async()=>({result:null,errorCode:'metadata-directory-state-unavailable',storageError:{operation:'write',code:'C:\\private'}});
 await assert.rejects(t.client.status(),/invalid-response/);assert.equal(t.reports.length,1,'malformed private detail is not reported');
 t=fixture();await t.client.status();const stoppedPid=t.calls[0].pid;t.setPid(stoppedPid+1);await t.client.shutdown();assert.equal(t.calls.filter(c=>c.op.endsWith('.shutdown')).length,0,'passive shutdown never targets a replacement process');
 console.log('Shell metadata client: one attach, pure forwarding, bounded replies/errors, passive wake/stop, restore coalescing, process retirement and no replay passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
