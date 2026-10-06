const assert=require("node:assert/strict");
const {createMetadataBuildRuntime}=require("../dist-electron/metadataExtraction/metadataBuildRuntime.js");
const volumeId="A".repeat(32),folder="1".repeat(16);
const policy={volumeOrder:[volumeId],includes:[{volumeId,rootFileReference:folder}],excludes:[]};
const grant={version:2,consent:true,intent:"active",policy,scopeLabels:{[`${volumeId}:${folder}`]:"X:\\Assets"}};
const catalog={volumes:[{volumeId,displayName:"X:",selected:true}]};
const resolution={resolved:true,queryable:true,volumeId,rootFileReference:folder};
const create=(saved=grant,extra={},readCatalog=async()=>catalog)=>{
 let stored=structuredClone(saved),configured=0,sweeps=0,changes=0;
 const protocol={async configure(){configured++},async pause(){},async discover(){sweeps++;return {jobs:[],next:null}},async consumeChanges(){changes++;return {hasMore:false}},async claim(){return {state:1}},
  async status(){return {state:"active",ledger:{pendingJobs:0,leasedJobs:0,unavailableVolumeIds:[]}}}};
 const runtime=createMetadataBuildRuntime(protocol,readCatalog,{yieldMs:0,preferences:{async load(){return structuredClone(stored)},async save(value){stored=structuredClone(value)}},
  resolveScope:async()=>resolution,workerFactory:()=>({close(){}}),...extra});
 return {runtime,count:()=>configured,sweeps:()=>sweeps,changes:()=>changes,saved:()=>stored};
};
const completed=async runtime=>{for(let i=0;i<100;i++){if((await runtime.status()).progress.phase==="completed")return;await new Promise(r=>setTimeout(r,5))}throw Error("restore-completion-timeout")};
(async()=>{
 const active=create();assert.equal((await active.runtime.status()).progress.phase,"idle");assert.equal(active.count(),0,"status remains read-only");
 await Promise.all([active.runtime.restore(),active.runtime.restore()]);await completed(active.runtime);await active.runtime.shutdown();
 assert.equal(active.sweeps(),9,"product owner restores one nine-provider full sweep");assert.ok(active.count()>=1);assert.equal(active.saved().intent,"completed","completion persisted before shutdown returns");
 const activeCount=active.count();await active.runtime.restore();assert.equal(active.count(),activeCount,"completed restore does not repeat sweep");
 const dormant=create({...grant,intent:"paused"});await dormant.runtime.restore();assert.equal(dormant.count(),0);assert.equal((await dormant.runtime.status()).progress.phase,"paused");await dormant.runtime.shutdown();
 const maintained=create({...grant,intent:"completed"});await maintained.runtime.restore();await maintained.runtime.notifyCatalogChange();
 assert.equal(maintained.sweeps(),0,"completed grant restores only dirty hints");assert.ok(maintained.changes()>=1);assert.equal((await maintained.runtime.status()).progress.phase,"completed");
 await maintained.runtime.pause();assert.equal(maintained.saved().intent,"paused","pause after completion remains durable");const beforePause=maintained.count();await maintained.runtime.notifyCatalogChange();assert.equal(maintained.count(),beforePause);await maintained.runtime.shutdown();
 const paused=create({...grant,intent:"paused"});await paused.runtime.restore();await paused.runtime.resume();await completed(paused.runtime);assert.equal(paused.sweeps(),9,"saved paused grant can explicitly resume");await paused.runtime.shutdown();
 for(const changed of [{...resolution,rootFileReference:"2".repeat(16)},{...resolution,volumeId:"B".repeat(32)},{...resolution,queryable:false}]){
  const item=create(grant,{resolveScope:async()=>changed});await item.runtime.restore();assert.equal(item.count(),0,"recreated/rebound/unqueryable folder cannot widen grant");assert.equal((await item.runtime.status()).progress.errorCode,"metadata-build-scope-changed");await item.runtime.shutdown();
 }
 const missingLabel=create({...grant,scopeLabels:{}});await missingLabel.runtime.restore();assert.equal(missingLabel.count(),0);await missingLabel.runtime.shutdown();
 const offline=create(grant,{resolveScope:async()=>{throw Error("offline")}});await offline.runtime.restore();assert.equal(offline.count(),0);await offline.runtime.shutdown();
 const noGrant=create(null);await noGrant.runtime.restore();await noGrant.runtime.notifyCatalogChange();assert.equal(noGrant.count(),0,"notifications do not create a grant");await noGrant.runtime.shutdown();
 const missingVolume=create(grant,{},async()=>({volumes:[]}));await missingVolume.runtime.restore();assert.equal(missingVolume.count(),0);assert.equal((await missingVolume.runtime.status()).progress.errorCode,"metadata-build-volume-unavailable");await missingVolume.runtime.shutdown();
 let building=true;
 const afterCatalog=create(grant,{},async()=>({...catalog,tasks:building?[{state:"running"}]:[],volumes:[{...catalog.volumes[0],state:building?"building":"ready",queryable:!building}]}));
 await afterCatalog.runtime.restore();assert.equal(afterCatalog.count(),0,"metadata waits for base Catalog initialization");assert.equal(afterCatalog.saved().intent,"active");
 building=false;await afterCatalog.runtime.restore();await completed(afterCatalog.runtime);assert.equal(afterCatalog.sweeps(),9,"ready owner observation retries deferred restoration once");await afterCatalog.runtime.shutdown();
 let release;const racing=create(grant,{resolveScope:()=>new Promise(resolve=>{release=resolve})});
 const restoring=racing.runtime.restore();for(let i=0;i<100&&!release;i++)await new Promise(r=>setTimeout(r,1));
 await racing.runtime.pause();release(resolution);await restoring;assert.equal(racing.count(),0,"pause invalidates pending restore before extraction");assert.equal(racing.saved().intent,"paused");await racing.runtime.shutdown();
 // Stop during an in-flight owner restoration retains the active grant rather
 // than silently turning application exit into a durable user pause.
 let resolveWaiting;const stopping=create(grant,{resolveScope:()=>new Promise(resolve=>{resolveWaiting=resolve})});
 const pending=stopping.runtime.restore();for(let i=0;i<100&&!resolveWaiting;i++)await new Promise(r=>setTimeout(r,1));
 await stopping.runtime.shutdown();resolveWaiting(resolution);await pending;assert.equal(stopping.count(),0);assert.equal(stopping.saved().intent,"active");
 console.log(JSON.stringify({ownerRestoration:"ok",statusDormant:true,pauseDurable:true,scopeIdentityRevalidated:true,shutdownPreservesIntent:true}));
})().catch(error=>{console.error(error);process.exitCode=1});
