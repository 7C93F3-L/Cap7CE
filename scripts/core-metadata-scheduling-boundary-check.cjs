const fs=require('node:fs'),path=require('node:path');
module.exports=(root,sourceFiles,failures)=>{
 require('./core-metadata-build-hosting-boundary-check.cjs')(root,failures);
 const directory='core/src/Cap7CE.Core.Host/MetadataScheduling',limits={'IMetadataBuildSession.cs':20,'IMetadataBuildCatalog.cs':15,'MetadataBuildProgress.cs':30,'MetadataBuildEstimate.cs':30,
  'MetadataBuildSpecifications.cs':20,'MetadataSweepDiscovery.cs':80,'MetadataBuildSweep.cs':125,'MetadataBuildChangeDrain.cs':50,'MetadataBuildCoordinator.cs':115,'MetadataBuildStatus.cs':25,'MetadataDirectoryBuildLoop.cs':75,'MetadataDirectoryBuildRequests.cs':50,'MetadataDirectoryScopeResolver.cs':30,'MetadataGlobalBuildOwner.cs':145,'MetadataGlobalBuildState.cs':100};
 if(JSON.stringify(fs.readdirSync(path.join(root,directory)).sort())!==JSON.stringify(Object.keys(limits).sort()))failures.push('Core metadata scheduling contains unregistered modules.');
 for(const[name,maximum]of Object.entries(limits)){
  const text=fs.readFileSync(path.join(root,directory,name),'utf8');
  if(text.split(/\r?\n/).length>maximum)failures.push(`${name} exceeds its Core scheduling responsibility.`);
  if(/System\.Net|HttpClient|Process\.|DeviceIoControl|DllImport|Sqlite|Reader\.Host|\b(?:File|Directory|FileStream|DriveInfo)\b|PeriodicTimer/.test(text))failures.push(`${name} bypasses the owned in-process metadata broker.`);
 }
 for(const[file,maximum]of [['core/node/metadataExecution/metadataBuildSpecifications.ts',30],['core/node/fileFacts/domain/metadataExtractorVersions.ts',6],['scripts/metadata-extractor-manifest.cjs',25]]){
  const text=fs.readFileSync(path.join(root,file),'utf8');if(text.split(/\r?\n/).length>maximum)failures.push(`${file} exceeds its pure extractor definition boundary.`);
 }
 const definitions=fs.readFileSync(path.join(root,'core/node/metadataExecution/metadataBuildSpecifications.ts'),'utf8');
 if(/from ['"](?:electron|node:)|videoMetadataFrames|imageMetadataMetrics|fetch\(|setInterval\(|setTimeout\(/.test(definitions))failures.push('Extractor table must remain pure and independent of content decoders.');
 const builder=fs.readFileSync(path.join(root,'scripts/metadata-worker-build.cjs'),'utf8');
 if(!builder.includes('require("./metadata-extractor-manifest.cjs")(root, output)'))failures.push('Independent metadata resource build must emit the single extractor table.');
 const sweep=fs.readFileSync(path.join(root,directory,'MetadataBuildSweep.cs'),'utf8');
 for(const anchor of ['TaskCreationOptions.RunContinuationsAsynchronously','await ready.Task','await session.PauseAsync(CancellationToken.None);','await work;','MetadataBuildSpecifications.Copy','token.ThrowIfCancellationRequested()'])
  if(!sweep.includes(anchor))failures.push(`Core sweep is missing ${anchor}.`);
};
