const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const launch=require('../dist-electron/core/coreHostLaunchProfile.js'),original=launch.createCoreHostLaunchProfile;
const {metadataWorkerPaths}=require('../dist-electron/metadataExtraction/metadataWorkerPaths.js'),{CoreHostController}=require('../dist-electron/core/coreHostController.js');
const capability=require('../dist-electron/computerSearchCapability.js'),configure=capability.ComputerSearchCapabilityController.prototype.configure;
let metadata=false,systemActions=0;
capability.ComputerSearchCapabilityController.prototype.configure=async()=>{systemActions++;throw Error('Startup cannot silently repair protected components')};
launch.createCoreHostLaunchProfile=(_mode,token)=>{const profile=original('probe',token),environment={...process.env};delete environment.CAP7CE_METADATA_RUNTIME_ROOT;delete environment.CAP7CE_METADATA_VIDEO_HELPER;if(metadata){const resources=metadataWorkerPaths();environment.CAP7CE_METADATA_RUNTIME_ROOT=path.dirname(resources.executable);environment.CAP7CE_METADATA_VIDEO_HELPER=resources.videoHelper}return{...profile,environment}};
(async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'cap7ce-capability-gate-'));let runtime,current,probe;const executablePath=path.resolve('core/artifacts/bin/Cap7CE.Core.Host/Release/net10.0-windows/Cap7CE.Core.Host.exe');
 try{
  runtime=require('../dist-electron/computerSearchRuntime.js').createComputerSearchRuntime({packaged:false,productVersion:'1.0.4',executablePath,favoritePreferencesPath:path.join(root,'preferences.json')});
  const unavailable=await runtime.status();assert.equal(unavailable.state,'repair-required','incompatible protected Core uses the existing explicit repair flow');assert.equal(unavailable.searchAvailable,false);assert.equal(systemActions,0);await runtime.stop();runtime=undefined;
  metadata=true;current=new CoreHostController({packaged:false,productVersion:'1.0.4',launchMode:'product',executablePath});assert.equal((await current.start()).state,'ready');assert.equal(current.supports('metadata.build.attach'),true);await current.stop();current=undefined;
  metadata=false;probe=new CoreHostController({packaged:false,productVersion:'1.0.4',launchMode:'probe',executablePath});assert.equal((await probe.start()).state,'ready');assert.equal(probe.supports('metadata.build.attach'),false,'resource-free probes retain their original contract');await probe.stop();probe=undefined;
  assert.equal(systemActions,0);await assert.rejects(fs.access(path.join(root,'preferences.json')),'rejected startup does not create or rewrite user preferences');
  console.log('Authenticated product capability gate: old resource-free Core rejected into explicit repair, current Core accepted, isolated probes unchanged, no automatic system repair or user configuration writes passed.');
 }finally{await runtime?.stop();await current?.stop();await probe?.stop();launch.createCoreHostLaunchProfile=original;capability.ComputerSearchCapabilityController.prototype.configure=configure;assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('cap7ce-capability-gate-'));await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1});
