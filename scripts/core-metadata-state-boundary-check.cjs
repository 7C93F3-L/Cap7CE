const fs=require('node:fs'),path=require('node:path');
const directory='core/src/Cap7CE.Core.Host/MetadataBuild';
module.exports=(root,sourceFiles,failures)=>{
  const limits={'MetadataStateFile.cs':50,'MetadataStateErrors.cs':25,'MetadataDirectoryPath.cs':25,'MetadataBuildStateSchema.cs':50,
    'MetadataBuildPreferencesFile.cs':40,'MetadataDirectoryQueueFile.cs':40,'MetadataBuildTestVisibility.cs':5,'MetadataBuildGrantLifecycle.cs':110,'MetadataDirectoryQueueState.cs':50};
  if(JSON.stringify(fs.readdirSync(path.join(root,directory)).sort())!==JSON.stringify(Object.keys(limits).sort()))failures.push('Metadata state contains unregistered modules.');
  for(const[name,limit]of Object.entries(limits)){
    const source=fs.readFileSync(path.join(root,directory,name),'utf8');
    if(source.split(/\r?\n/).length>limit)failures.push(`${name} exceeds its metadata state boundary.`);
    if(/System\.Net|Process\.|DeviceIoControl|DllImport|Sqlite|Reader\.Host|PeriodicTimer|Task\.Delay|FileFactHostSession|NodeMetadataWorker/.test(source))failures.push(`${name} escapes passive metadata state ownership.`);
    if(name!=='MetadataStateFile.cs'&&/\b(?:FileStream|File|Directory)\./.test(source))failures.push(`${name} bypasses metadata state IO.`);
  }
  const io=fs.readFileSync(path.join(root,directory,'MetadataStateFile.cs'),'utf8');
  for(const anchor of ['MaximumBytes = 1024 * 1024','SemaphoreSlim gate','FileMode.CreateNew','flushToDisk: true','File.Move(temporary, path, overwrite: true)','if (created)','FileShare.Read'])
    if(!io.includes(anchor))failures.push(`Metadata state IO is missing ${anchor}.`);
  if(/Directory\.(?:Delete|Move|Enumerate|GetFiles)|File\.(?:Copy|ReadAll|WriteAll)/.test(io))failures.push('Metadata state IO must not enumerate or operate on unrelated files.');
};
module.exports.ownsStorage=relative=>relative===`${directory}/MetadataStateFile.cs`;
