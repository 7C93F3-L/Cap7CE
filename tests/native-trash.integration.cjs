const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-trash-batch-'));
const host=path.resolve(__dirname,'../core/artifacts/file-operations-host/Cap7CE.Core.FileOperations.Host.exe');
async function run(targets,cacheRoots=[]){
 const request=Buffer.from(JSON.stringify({version:1,requestId:1,mode:'catalog',targets,cacheRoots}));
 const header=Buffer.alloc(4);header.writeInt32LE(request.length);
 const child=spawn(host,['--trash-session','--parent-pid',String(process.pid)],{windowsHide:true});
 const chunks=[];let error='';child.stdout.on('data',data=>chunks.push(data));child.stderr.on('data',data=>error+=data);
 const finished=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(`${code}: ${error}`)));});
 child.stdin.end(Buffer.concat([header,request]));await finished;
 const bytes=Buffer.concat(chunks);assert(bytes.length>=4);assert.equal(bytes.readInt32LE(),bytes.length-4);return JSON.parse(bytes.subarray(4));
}
(async()=>{try{
 const targets=Array.from({length:100},(_,index)=>({path:path.join(root,`临时-${index}.txt`),isDirectory:false}));
 for(const target of targets)fs.writeFileSync(target.path,'owned trash fixture');
 const began=performance.now(), result=await run(targets), elapsedMs=Math.round(performance.now()-began);
 assert.equal(result.success,true);assert.equal(result.deletedPaths.length,100);assert.deepEqual(result.failedItems,[]);
 for(const target of targets)assert.equal(fs.existsSync(target.path),false);
 const folder=path.join(root,'folder'),nested=path.join(folder,'nested.txt'),protectedFile=path.join(root,'protected.txt');
 fs.mkdirSync(folder);fs.writeFileSync(nested,'nested fixture');fs.writeFileSync(protectedFile,'preserve');
 const mixed=await run([{path:folder,isDirectory:true},{path:nested,isDirectory:false},{path:protectedFile,isDirectory:false},{path:path.join(root,'missing.txt'),isDirectory:false}],[protectedFile]);
 assert.equal(mixed.success,false);assert.equal(mixed.deletedPaths.length,2);assert.equal(mixed.failedItems.length,2);
 assert.equal(fs.existsSync(folder),false);assert.equal(fs.readFileSync(protectedFile,'utf8'),'preserve');
 console.log(JSON.stringify({passed:true,files:100,elapsedMs,nestedAndProtectedResults:true,source:'owned temporary fixtures',packaged:false}));
}finally{
 const resolved=path.resolve(root),temporary=path.resolve(os.tmpdir());
 assert.equal(path.dirname(resolved).toLowerCase(),temporary.toLowerCase());assert(path.basename(resolved).startsWith('Cap7CE-trash-batch-'));
 fs.rmSync(resolved,{recursive:true,force:true});
}})().catch(error=>{console.error(error);process.exitCode=1;});
