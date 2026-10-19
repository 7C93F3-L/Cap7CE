const assert = require('node:assert/strict');
const { registerMetadataBuildIpc } = require('../dist-electron/metadataExtraction/metadataBuildIpc.js');
const { directoryBuildPath } = require('../dist-electron/metadataExtraction/metadataDirectoryPath.js');
const { createSettingsMetadataBuildRequest } = require('../dist-electron/settingsMetadataBuildRequest.js');
const id='A'.repeat(32), policy={volumeOrder:[id], includes:[{volumeId:id,rootFileReference:null}],excludes:[]};
(async()=>{
 const handlers=new Map(), calls=[],signals=[]; let releaseSave;
 const api={status:async()=>({}),resolveScope:async p=>{calls.push(['resolve',p]);},savePolicy:async p=>{calls.push(['save',p]);if(releaseSave===true)await new Promise(r=>releaseSave=r);},
  start:async p=>calls.push(['start',p]),startDirectory:async p=>calls.push(['directory',p]),startAllVolumes:async p=>calls.push(['all',p]),pause:async()=>{},resume:async()=>{},cancelDirectories:async()=>{}};
 registerMetadataBuildIpc({handle:(key,fn)=>handlers.set(key,fn),on(){}},e=>e.main||e.settings,api,{isDirectorySenderAllowed:e=>e.main,onChanged:()=>signals.push(true)});
 const invoke=(key,event,value)=>Promise.resolve().then(()=>handlers.get('metadataBuild:'+key)(event,value));
 await assert.rejects(invoke('savePolicy',{},policy),/not allowed/);
 for(const bad of [{...policy,volumeOrder:[]},{...policy,volumeOrder:[id,id]},{...policy,includes:[{volumeId:'B'.repeat(32),rootFileReference:null}]}])await assert.rejects(invoke('savePolicy',{settings:true},bad));
 await invoke('savePolicy',{settings:true},policy);assert.deepEqual(calls.map(v=>v[0]),['save'],'saving configuration cannot execute a start');
 await assert.rejects(invoke('start',{settings:true},{policy}),/confirmation-required/);
 await assert.rejects(invoke('startDirectory',{settings:true},{path:'X:/Assets',allowMetadataExtraction:true}),/not allowed/);
 await assert.rejects(invoke('startAllVolumes',{settings:true},{allowMetadataExtraction:true}),/not allowed/);
 await invoke('startDirectory',{main:true},{path:'x:/Assets/',allowMetadataExtraction:true});assert.equal(calls.at(-1)[1].path,'x:\\Assets');
 await invoke('startAllVolumes',{main:true},{allowMetadataExtraction:true});await invoke('start',{settings:true},{allowMetadataExtraction:true,policy});
 assert.deepEqual(calls.map(v=>v[0]),['save','directory','all','start']);assert.ok(signals.length);
 for(const bad of [null,'relative','X:/bad?','X:/file:stream','X:/bad'+String.fromCharCode(0),'//server/share'])assert.throws(()=>directoryBuildPath(bad));
 assert.equal(directoryBuildPath('X:/'),'X:\\');
 releaseSave=true;const pending=invoke('savePolicy',{settings:true},policy);await new Promise(r=>setImmediate(r));
 await assert.rejects(invoke('start',{settings:true},{allowMetadataExtraction:true,policy}),/busy/);releaseSave();await pending;
 let releaseOpen,notified=0;const nav=createSettingsMetadataBuildRequest(()=>new Promise(r=>releaseOpen=r),()=>notified++);
 const opening=nav.request();assert.equal(nav.consume(),true);releaseOpen(true);assert.equal(await opening,true);assert.equal(notified,1);assert.equal(nav.consume(),false);
 const rejected=createSettingsMetadataBuildRequest(async()=>false);assert.equal(await rejected.request(),false);assert.equal(rejected.consume(),false);
 console.log('Metadata IPC: configuration-only forwarding, confirmation, sender isolation, bounded policy/path validation, mutation lock and navigation mailbox passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
