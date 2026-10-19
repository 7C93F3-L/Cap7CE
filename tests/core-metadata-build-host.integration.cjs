const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite');
const launch=require('../dist-electron/core/coreHostLaunchProfile.js'),original=launch.createCoreHostLaunchProfile;
const {metadataWorkerPaths}=require('../dist-electron/metadataExtraction/metadataWorkerPaths.js');
const {CoreHostController}=require('../dist-electron/core/coreHostController.js');
const {CoreMetadataBuildClient}=require('../dist-electron/core/coreMetadataBuildClient.js');
let probeRoot;launch.createCoreHostLaunchProfile=(mode,token)=>{assert.equal(mode,'probe');probeRoot=path.join(os.tmpdir(),'Cap7CE-Core-P32-'+token);const profile=original(mode,token),resources=metadataWorkerPaths();return {...profile,environment:{...process.env,CAP7CE_METADATA_RUNTIME_ROOT:path.dirname(resources.executable),CAP7CE_METADATA_VIDEO_HELPER:resources.videoHelper}};};
const controller=new CoreHostController({packaged:false,productVersion:'1.0.4',launchMode:'probe',executablePath:path.resolve('core/artifacts/bin/Cap7CE.Core.Host/Release/net10.0-windows/Cap7CE.Core.Host.exe')});
const client=new CoreMetadataBuildClient({request:(op,body,deadlineMs)=>controller.startRequest(op,body,deadlineMs).response,ensureCatalog:()=>controller.start(),supports:op=>controller.supports(op),processId:()=>controller.snapshot().processId??null,active:()=>true});
const id='a'.repeat(32),policy={volumeOrder:[id],includes:[{volumeId:id,rootFileReference:null}],excludes:[]};
const until=async fn=>{for(let i=0;i<500;i++){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,10));}throw Error('metadata host timeout');};
(async()=>{try{
 assert.equal((await controller.start()).state,'ready');assert.ok(probeRoot);assert.ok(controller.supports('metadata.build.attach'));
 const db=new DatabaseSync(path.join(probeRoot,'catalog.db'));try{db.exec("INSERT INTO catalog_volumes_v2 VALUES('"+id+"','X:','NTFS',1,NULL,NULL,NULL,NULL,'ready',0,NULL,0)");}finally{db.close();}
 assert.equal((await client.status()).progress.phase,'idle');
 const config=path.join(probeRoot,'metadata-config'),globalFile=path.join(config,'metadata-build.json');
 assert.equal(fs.existsSync(globalFile),false,'attach/status cannot write a grant');
 await client.savePolicy(policy);assert.equal(JSON.parse(fs.readFileSync(globalFile)).consent,false);
 await client.restore();await client.notifyCatalogChange();assert.equal((await client.status()).progress.phase,'idle');
 await assert.rejects(client.start({allowMetadataExtraction:false,policy}),/confirmation-required/);
 await client.start({allowMetadataExtraction:true,policy});await until(async()=> (await client.status()).progress.phase==='completed');
 assert.equal(JSON.parse(fs.readFileSync(globalFile)).consent,true);
 await client.pause();assert.equal((await client.status()).progress.phase,'paused');
 const saved=fs.readFileSync(globalFile,'utf8');await client.startAllVolumes({allowMetadataExtraction:true});
 await until(async()=>!(await client.status()).directoryTask);
 assert.equal(fs.readFileSync(globalFile,'utf8'),saved,'temporary whole-volume action preserves global settings');
 assert.equal((await client.status()).progress.phase,'paused');
 await client.cancelDirectories();await client.shutdown();await client.shutdown();
 console.log('Real SC1 metadata build: native Core attachment, configuration-only restore, durable explicit grant, bounded errors, whole-volume borrowing and shutdown passed without Reader/source jobs.');
 }finally{await client.shutdown().catch(()=>{});await controller.stop();launch.createCoreHostLaunchProfile=original;}
})().catch(e=>{console.error(e);process.exitCode=1;});
