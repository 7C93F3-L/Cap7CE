const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const roots=['core/src/Cap7CE.Core.FileOperations','core/src/Cap7CE.Core.FileOperations.Host','core/src/Cap7CE.Core.Configuration','native/Cap7CE.Core.FileOperations'];
function fingerprint(root){
 const walk=directory=>fs.readdirSync(path.join(root,directory),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(`${directory}/${entry.name}`):/\.(?:cs|csproj|cpp|h)$/.test(entry.name)?[`${directory}/${entry.name}`]:[]);
 const files=[...roots.flatMap(walk),'scripts/core-file-operations-build.cjs','scripts/core-file-operations-freshness.cjs'];
 const hash=crypto.createHash('sha256');for(const file of files.sort()){hash.update(file);hash.update(fs.readFileSync(path.join(root,file)));}return hash.digest('hex');
}
const stamp=root=>path.join(root,'core/artifacts/file-operations-host/source-fingerprint.txt');
exports.isFresh=root=>{
 try{return ['Cap7CE.Core.FileOperations.Host.exe','Cap7CE.Core.FileOperations.Native.dll'].every(name=>fs.existsSync(path.join(path.dirname(stamp(root)),name)))&&fs.readFileSync(stamp(root),'utf8')===fingerprint(root);}catch{return false;}
};
exports.record=root=>fs.writeFileSync(stamp(root),fingerprint(root));
