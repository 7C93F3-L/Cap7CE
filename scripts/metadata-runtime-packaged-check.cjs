const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),manifest=require('../third_party/node-runtime/manifest.json');
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
 const file=path.join(directory,entry.name);if(entry.isSymbolicLink())throw Error('Unexpected linked Core runtime resource.');
 return entry.isDirectory()?files(file):[file];
})}
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function compareMetadataRuntimeFiles(source,destination){
 source=path.resolve(source);destination=path.resolve(destination);
 if(source.toLowerCase()===destination.toLowerCase())throw Error('Packaged Core runtime must be independently copied.');
 const expected=files(source).map(file=>path.relative(source,file)).sort(),actual=files(destination).map(file=>path.relative(destination,file)).sort();
 if(!expected.some(file=>file.startsWith('node_modules'+path.sep)))throw Error('Source Core runtime has no independent dependencies.');
 const missing=expected.filter(file=>!actual.includes(file)),extra=actual.filter(file=>!expected.includes(file));
 if(missing.length||extra.length)throw Error(`Packaged Core runtime differs: ${missing.length} missing, ${extra.length} unexpected files.`);
 for(const file of expected)if(digest(path.join(source,file))!==digest(path.join(destination,file)))throw Error(`Packaged Core runtime bytes differ: ${file}`);
 const nodeSha256=digest(path.join(destination,'node.exe'));
 return{status:'passed',files:expected.length,nodeSha256};
}
module.exports={compareMetadataRuntimeFiles};
if(require.main===module){try{
 const report=compareMetadataRuntimeFiles(path.join(root,'artifacts/metadata-worker/v1'),process.argv[2]??path.join(root,'release/win-unpacked/resources/metadata-worker/v1'));
 if(report.nodeSha256!==manifest.sha256)throw Error('Packaged Node does not retain pinned official bytes.');console.log(JSON.stringify(report));
}catch(error){console.error(error.message);process.exitCode=1}}
