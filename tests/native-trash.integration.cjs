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
 // Restore only a fixture from this uniquely owned directory, then recycle it again.
 const restorePath=path.join(root,'restore-probe.txt');fs.writeFileSync(restorePath,'restore fixture');
 assert.equal((await run([{path:restorePath,isDirectory:false}])).success,true);
 const restoreScript=`$ErrorActionPreference='Stop';$shell=New-Object -ComObject Shell.Application;$bin=$shell.NameSpace(10);$found=@($bin.Items() | Where-Object { $_.ExtendedProperty('System.Recycle.DeletedFrom') -eq $env:CAP7CE_TRASH_FIXTURE -and ($_.Name -eq 'restore-probe.txt' -or $_.Name -eq 'restore-probe') });if($found.Count -ne 1){throw 'Expected exactly one owned restore fixture'};$found[0].InvokeVerb('undelete')`;
 const restore=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(restoreScript,'utf16le').toString('base64')],{windowsHide:true,env:{...process.env,CAP7CE_TRASH_FIXTURE:root}});
 let restoreError='';restore.stderr.on('data',data=>restoreError+=data);
 await new Promise((resolve,reject)=>{restore.on('error',reject);restore.on('close',code=>code===0?resolve():reject(new Error(restoreError)));});
 for(let i=0;i<100&&!fs.existsSync(restorePath);i++)await new Promise(resolve=>setTimeout(resolve,100));
 assert.equal(fs.readFileSync(restorePath,'utf8'),'restore fixture');
 const repeated=await run([{path:restorePath,isDirectory:false}]);assert.equal(repeated.success,true);assert.equal(fs.existsSync(restorePath),false);
 const folder=path.join(root,'folder'),nested=path.join(folder,'nested.txt'),protectedFile=path.join(root,'protected.txt');
 fs.mkdirSync(folder);fs.writeFileSync(nested,'nested fixture');fs.writeFileSync(protectedFile,'preserve');
 const mixed=await run([{path:folder,isDirectory:true},{path:nested,isDirectory:false},{path:protectedFile,isDirectory:false},{path:path.join(root,'missing.txt'),isDirectory:false}],[protectedFile]);
 assert.equal(mixed.success,false);assert.equal(mixed.deletedPaths.length,2);assert.equal(mixed.failedItems.length,2);
 assert.equal(fs.existsSync(folder),false);assert.equal(fs.readFileSync(protectedFile,'utf8'),'preserve');
 console.log(JSON.stringify({passed:true,files:100,elapsedMs,nestedAndProtectedResults:true,recycleRestoreRecycle:true,source:'owned temporary fixtures',packaged:false}));
}finally{
 const resolved=path.resolve(root),temporary=path.resolve(os.tmpdir());
 assert.equal(path.dirname(resolved).toLowerCase(),temporary.toLowerCase());assert(path.basename(resolved).startsWith('Cap7CE-trash-batch-'));
 fs.rmSync(resolved,{recursive:true,force:true});
}})().catch(error=>{console.error(error);process.exitCode=1;});
