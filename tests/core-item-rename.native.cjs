const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),exe=path.join(root,'core/artifacts/file-operations-host/Cap7CE.Core.FileOperations.Host.exe');
const directory=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'cap7ce-rename-')));
function invoke(paths,name){
 const data=Buffer.from(JSON.stringify({version:1,operation:'rename-items',owner:'0',paths,name})),header=Buffer.alloc(4);header.writeInt32LE(data.length);
 const result=spawnSync(exe,[],{input:Buffer.concat([header,data]),timeout:15000,windowsHide:true});
 assert.equal(result.status,0,`native host: ${result.error||result.stderr}`);assert(result.stdout.length>=4);
 return JSON.parse(result.stdout.subarray(4,4+result.stdout.readInt32LE()).toString('utf8'));
}
try {
 const source=path.join(directory,'原名称 with space.txt');fs.writeFileSync(source,'single-payload');
 const single=invoke([source],'新名称 with space.txt');assert.equal(single.success,true);assert.equal(single.changes[0].source,source);
 assert.equal(fs.readFileSync(single.changes[0].path,'utf8'),'single-payload');assert(!fs.existsSync(source));
 const sources=['one.jpg','two.jpg','three.png','four.txt','plain'].map((name,i)=>{const file=path.join(directory,name);fs.writeFileSync(file,`payload-${i}`);return file;});
 fs.writeFileSync(path.join(directory,'统一名称 (1).jpg'),'existing-collision');
 const batch=invoke(sources,'统一名称');assert.equal(batch.success,true,JSON.stringify(batch));assert.equal(batch.changes.length,sources.length);
 assert.equal(new Set(batch.changes.map(item=>item.path.toLowerCase())).size,sources.length);
 for(const change of batch.changes){const i=sources.indexOf(change.source);assert(i>=0);assert.equal(path.extname(change.path),path.extname(change.source));assert.equal(fs.readFileSync(change.path,'utf8'),`payload-${i}`);assert(path.basename(change.path).startsWith('统一名称'));}
 assert.equal(fs.readFileSync(path.join(directory,'统一名称 (1).jpg'),'utf8'),'existing-collision');
 const sameBase=['original-a.jpg','original-b.jpg'].map(name=>{const file=path.join(directory,name);fs.writeFileSync(file,name);return file;});
 const same=invoke(sameBase,'original-a');assert.equal(same.success,true,JSON.stringify(same));
 const special=path.join(directory,'comma, ampersand & (1).txt');fs.writeFileSync(special,'special');assert.equal(invoke([special],'changed, & (2).txt').success,true);
 const folders=['folder-a','folder-b'].map(name=>{const file=path.join(directory,name);fs.mkdirSync(file);fs.writeFileSync(path.join(file,'keep.txt'),name);return file;});
 const renamedFolders=invoke(folders,'文件夹');assert.equal(renamedFolders.success,true);
 for(const change of renamedFolders.changes)assert.equal(fs.readFileSync(path.join(change.path,'keep.txt'),'utf8'),path.basename(change.source));
 assert.equal(invoke([single.changes[0].path],'../escape').errorCode,'invalid-name');assert(fs.existsSync(single.changes[0].path));
 console.log('Native rename passed: Unicode/spaces, real file/folder batch numbering, mixed extensions, collisions without overwrite, content preservation and invalid-name rejection.');
} finally {assert(directory.startsWith(fs.realpathSync.native(os.tmpdir())+path.sep)&&path.basename(directory).startsWith('cap7ce-rename-'));fs.rmSync(directory,{recursive:true,force:true});}
