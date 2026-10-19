const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process'),esbuild=require('esbuild');
const {VisualCacheFrameReader,maximumCacheFrameBytes}=require('../dist-electron/core/visualCacheFrames.js');
const {metadataWorkerPaths}=require('../dist-electron/metadataExtraction/metadataWorkerPaths.js');
const frame=(id,method,args=[])=>{const payload=Buffer.from(JSON.stringify({version:1,id,method,args})),header=Buffer.alloc(4);header.writeUInt32LE(payload.length);return Buffer.concat([header,payload]);};
function fixture(){
 let closed=false,active=0,maximum=0;const held=[];
 const owner={async dispatch(method,args){if(!Array.isArray(args))throw Error('domain-invalid');
  if(method==='hold')return closed?'retired':new Promise(resolve=>held.push(resolve));
  if(method==='error')throw Object.assign(Error('x'.repeat(2000)),{code:'synthetic'});
  if(method==='serial'){active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,15));active--;return{maximum};}
  return args;},async close(){closed=true;for(const resolve of held)resolve('retired');await new Promise(r=>setTimeout(r,15));}};
 serveCoreNode(owner,['serial']).catch(()=>{process.exitCode=1;process.stdin.destroy();});
}
(async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'cap7ce-node-server-'));try{
 const worker=path.join(root,'fixture.cjs');await esbuild.build({stdin:{contents:'import{serveCoreNode}from '+JSON.stringify(path.resolve('core/node/transport/server.ts'))+';('+fixture.toString()+')();',resolveDir:process.cwd(),loader:'ts'},outfile:worker,bundle:true,platform:'node',format:'cjs',target:'node24'});
 const launch=()=>{const child=spawn(metadataWorkerPaths().executable,[worker],{windowsHide:true,stdio:['pipe','pipe','pipe']});const replies=[];let stderr='';child.stderr.on('data',b=>{stderr=(stderr+b).slice(-1000)});child.stdin.on('error',()=>{});const reader=new VisualCacheFrameReader(b=>replies.push(JSON.parse(b.toString('utf8'))));child.stdout.on('data',b=>reader.push(b));const exit=new Promise(resolve=>child.once('close',code=>resolve(code)));const timer=setTimeout(()=>child.kill(),10000);return{child,replies,async done(){try{return await exit;}finally{clearTimeout(timer);if(child.exitCode===null)child.kill();assert.equal(stderr,'');}}};};
 let test=launch();test.child.stdin.write(frame(1,'serial'));test.child.stdin.write(frame(2,'serial'));for(const byte of frame(3,'echo',['片段 😀']))test.child.stdin.write(Buffer.from([byte]));test.child.stdin.write(frame(4,'error'));test.child.stdin.end();assert.equal(await test.done(),0);
 assert.equal(test.replies.find(r=>r.id===3).result[0],'片段 😀');assert.ok(test.replies.findIndex(r=>r.id===3)<test.replies.findIndex(r=>r.id===1));assert.deepEqual(test.replies.find(r=>r.id===2).result,{maximum:1});assert.equal(test.replies.find(r=>r.id===4).error.message.length,1024);
 test=launch();test.child.stdin.end(frame(1,'hold'));assert.equal(await test.done(),0);assert.equal(test.replies[0].result,'retired','EOF closes the owner before draining admitted work');
 test=launch();test.child.stdin.end(Buffer.concat([frame(1,'echo'),frame(1,'echo')]));assert.equal(await test.done(),1);assert.ok(test.replies.every(r=>r.id===1));
 test=launch();test.child.stdin.end(Buffer.concat(Array.from({length:65},(_,i)=>frame(i+1,'hold'))));assert.equal(await test.done(),1);assert.ok(test.replies.every(r=>r.id<=64));
 test=launch();const oversized=Buffer.alloc(4);oversized.writeUInt32LE(maximumCacheFrameBytes+1);test.child.stdin.end(oversized);assert.equal(await test.done(),1);assert.deepEqual(test.replies,[]);
 test=launch();test.child.stdin.end(frame(1,'echo').subarray(0,6));assert.equal(await test.done(),1);assert.deepEqual(test.replies,[]);
 console.log('Core Node server: fragmented Unicode, parallel replies, caller-selected serial work, bounded errors, EOF owner cleanup, replay, request quota, oversize and truncated-frame rejection passed.');
 }finally{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true,maxRetries:3});}
})().catch(e=>{console.error(e);process.exitCode=1;});
