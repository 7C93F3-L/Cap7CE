const fs=require('node:fs'),path=require('node:path');
module.exports=(root,failures)=>{
 const dir='core/src/Cap7CE.Core.Host/MetadataBuildHosting',limits={'MetadataBuildAssembly.cs':18,'MetadataBuildControlDispatch.cs':20,'MetadataBuildRequestHandler.cs':65,'MetadataBuildService.cs':55};
 if(JSON.stringify(fs.readdirSync(path.join(root,dir)).sort())!==JSON.stringify(Object.keys(limits).sort()))failures.push('Core metadata hosting contains unregistered modules.');
 for(const [name,max]of Object.entries(limits)){
  const s=fs.readFileSync(path.join(root,dir,name),'utf8');
  if(s.split(/\r?\n/).length>max||/Sqlite|HttpClient|Process\.|DeviceIoControl|File\.(?:Read|Write|Delete)|Directory\.(?:Delete|Enumerate)|PeriodicTimer/.test(s))failures.push(name+' escapes metadata hosting assembly/dispatch ownership.');
 }
 const read=p=>fs.readFileSync(path.join(root,p),'utf8'),client=read('electron/core/coreMetadataBuildClient.ts');
 if(/node:|FileFact|setInterval|setTimeout|lease|discover|savePreferences|MetadataWorkerClient/.test(client))failures.push('Main metadata client regained grant, persistence or execution ownership.');
 const runtime=read('electron/computerSearchRuntime.ts');
 if(!runtime.includes('new CoreMetadataBuildClient')||/metadataBuildRuntime|metadataBuildPreferences|coreMetadataProtocol/.test(runtime))failures.push('Main must exclusively forward metadata build actions to Core.');
 for(const p of ['electron/metadataBuildPreferences.ts','electron/metadataBuildLifecycle.ts','electron/metadataDirectoryBuildStore.ts','electron/metadataExtraction/metadataBuildRuntime.ts','electron/metadataExtraction/metadataBuildController.ts','electron/core/coreMetadataProtocol.ts'])if(fs.existsSync(path.join(root,p)))failures.push(p+' resurrects retired Shell metadata ownership.');
 const dispatch=read('core/src/Cap7CE.Core.Host/CoreRequestDispatcher.cs');
 if(dispatch.indexOf('MetadataBuildOperations.IsControl(request.Operation)')<0||dispatch.indexOf('MetadataBuildOperations.IsControl(request.Operation)')>dispatch.indexOf('await executionSlots.WaitAsync'))failures.push('Metadata stop/control must bypass foreground query slots.');
 const service=read(dir+'/MetadataBuildService.cs');
 for(const a of ['session.AttachBuildOwnerAsync()','MetadataExtractorManifest.LoadAsync(resources.Root)','if (task is null) return','closed = true'])if(!service.includes(a))failures.push('Metadata hosting is missing '+a);
};
