const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http'),{EventEmitter}=require('node:events');
const {createCatalogAutoKeywordService}=require('../dist-electron/catalogAutoKeywordService.js');
const {parseGeneratedKeywords,generateImageKeywords}=require('../dist-electron/catalogAutoKeywordModel.js');
const {fingerprintKeywordSource}=require('../dist-electron/catalogAutoKeywordSource.js');
const {registerCatalogAutoKeywordIpc}=require('../dist-electron/catalogAutoKeywordIpc.js');
const {CoreVisualCacheClient}=require('../dist-electron/core/coreVisualCacheClient.js');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
(async()=>{
 assert.deepEqual(parseGeneratedKeywords('<think>hidden</think>[" 天空 ","天空","blue"]'),['天空','blue']);
 for(const text of ['[]','{}','[null]','[""]','["a\\nline"]',JSON.stringify(Array(21).fill('tag')),JSON.stringify(['x'.repeat(65)]),'说明：["天空"]'])assert.throws(()=>parseGeneratedKeywords(text));
 const modelRoot=await fs.mkdtemp(path.join(os.tmpdir(),'Cap7CE-keyword-model-')),modelClient=new CoreVisualCacheClient(path.join(modelRoot,'profile'));
 const transport={request:modelClient.request.bind(modelClient),cancel:modelClient.requestIfActive.bind(modelClient)};
 const generate=(connection,image,signal,timeout)=>generateImageKeywords(connection,image,signal,timeout,transport);
 const dataUrl='data:image/jpeg;base64,'+(await require('sharp')({create:{width:2,height:2,channels:3,background:'#123456'}}).jpeg().toBuffer()).toString('base64');
 let request,mode='valid';const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;request=JSON.parse(body);
  if(mode==='wait')return;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:mode==='valid'?'["山景","蓝色"]':'not-json'}}]}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const connection={baseUrl:`http://127.0.0.1:${server.address().port}`,modelName:'fixture'};
  assert.deepEqual(await generate(connection,dataUrl,new AbortController().signal),['山景','蓝色']);
  assert.equal(request.messages[0].content[0].image_url.url,dataUrl);assert.equal(request.stream,false);
  assert.ok(request.grammar.includes('thinking?'),'grammar accepts the legacy forced thinking prefix');assert.ok(request.grammar.includes('{0,11}'));assert.equal(request.max_tokens,512);assert.ok(!request.messages[0].content[1].text.includes('文件名'));
  mode='invalid';await assert.rejects(generate(connection,dataUrl,new AbortController().signal),/有效关键词/);
  mode='wait';await assert.rejects(generate(connection,dataUrl,new AbortController().signal,25),/超时/);
  const controller=new AbortController();const pending=generate(connection,dataUrl,controller.signal);controller.abort();await assert.rejects(pending,/cancelled/);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));modelClient.close();await fs.rm(modelRoot,{recursive:true,force:true})}
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'Cap7CE-auto-keywords-'));
 const sourceClient=new CoreVisualCacheClient(path.join(root,'profile')),fingerprint=item=>fingerprintKeywordSource(item,sourceClient.request.bind(sourceClient));
 try{
  const source=path.join(root,'source.png');await fs.writeFile(source,'synthetic');const stat=await fs.stat(source,{bigint:true});
  const item={path:source,name:'source.png',extension:'.png',isDirectory:false,createdFileTimeMilliseconds:String(stat.birthtimeNs/1000000n+11644473600000n)};
  const originalFingerprint=await fingerprint(item);await fs.appendFile(source,' changed');assert.notEqual(await fingerprint(item),originalFingerprint);
  await assert.rejects(fingerprint({...item,createdFileTimeMilliseconds:'1'}),/变化/);
  let reads=0,writes=0,begins=0,ends=0,authorized=true,changed=false,failWrite=false,conflicts=1,gate=null;
  let tags=['手工'],revision=1;const phases=[];
  const keywords={prepare:async()=>{},read:async()=>{reads++;return {keywords:[...tags],revision:String(revision)}},write:async(_item,words,expected)=>{
   writes++;if(failWrite)throw Error('write failed');if(conflicts-->0){tags.push('同时添加');revision++;return {saved:false,current:{keywords:tags,revision:String(revision)}}}
   assert.equal(expected,String(revision));tags=words;revision++;return {saved:true,current:{keywords:tags,revision:String(revision)}};
  }};
  const deps={keywords,fingerprint:async()=>changed?'changed':'same',prepareImage:async p=>{assert.equal(p,source);return '1536-image'},
   beginUse:async()=>{begins++},endUse:()=>{ends++},recognize:async(image,signal,starting,generating)=>{assert.equal(image,'1536-image');starting();generating();if(gate)await gate.promise;return ['手工','风景','风景']}};
  const run=createCatalogAutoKeywordService(deps),resolve=()=>{if(!authorized)throw Error('computer-search-authorization-expired');return item};
  let result=await run(resolve,new AbortController().signal,p=>phases.push(p));
  assert.equal(result.status,'saved');assert.equal(result.added,1);assert.deepEqual(tags,['手工','同时添加','风景']);assert.equal(reads,2);
  assert.deepEqual(phases,['preparing','starting','generating','saving']);assert.equal(begins,ends);
  result=await run(resolve,new AbortController().signal,()=>{});assert.equal(result.added,0,'repeat generation does not duplicate tags');
  gate=deferred();const cancel=new AbortController(),before=writes;
  const pending=run(resolve,cancel.signal,()=>{});await new Promise(r=>setImmediate(r));cancel.abort();gate.resolve();result=await pending;
  assert.equal(result.status,'cancelled');assert.equal(writes,before);assert.equal(begins,ends);
  gate=deferred();const retired=run(resolve,new AbortController().signal,()=>{});await new Promise(r=>setImmediate(r));authorized=false;gate.resolve();
  assert.match((await retired).message,/浏览位置/);assert.equal(writes,before);authorized=true;
  gate=deferred();const replaced=run(resolve,new AbortController().signal,()=>{});await new Promise(r=>setImmediate(r));changed=true;gate.resolve();
  assert.match((await replaced).message,/变化/);assert.equal(writes,before);changed=false;gate=null;
  failWrite=true;assert.equal((await run(resolve,new AbortController().signal,()=>{})).status,'failed');failWrite=false;
  tags=Array.from({length:128},(_,i)=>'tag'+i);const full=writes;assert.match((await run(resolve,new AbortController().signal,()=>{})).message,/上限/);assert.equal(writes,full);
  assert.equal((await run(()=>({...item,extension:'.mp4'}),new AbortController().signal,()=>{})).status,'failed');
  assert.equal(begins,ends,'all model uses are released, including cancellation, source changes and save errors');
  const handlers=new Map(),sender=new EventEmitter();sender.id=1;sender.isDestroyed=()=>false;const progress=[];sender.send=(_channel,p)=>progress.push(p);
  let requestGate=deferred();const api=createCatalogAutoKeywordService({...deps,recognize:async(_image,signal,starting)=>{starting();await requestGate.promise;if(signal.aborted)throw Error('cancelled');return ['one']}});
  registerCatalogAutoKeywordIpc({registrar:{handle:(n,f)=>handlers.set(n,f),on:()=>{}},isSenderAllowed:e=>e.allowed,keywords,
   resolveItem:r=>{assert.equal(r.authorizationId,'real');return item},createService:async()=>api});
  const event={allowed:true,sender},req={requestId:'one',taskId:'task',authorizationId:'real',filePath:'C:\\forged.png'};
  await assert.rejects(()=>handlers.get('computerSearch:generateKeywords')({...event,allowed:false},req),/not allowed/);
  await assert.rejects(()=>handlers.get('computerSearch:generateKeywords')(event,{...req,authorizationId:'forged'}));
  const job=handlers.get('computerSearch:generateKeywords')(event,req);await new Promise(r=>setImmediate(r));
  assert.equal((await handlers.get('computerSearch:generateKeywords')(event,{...req,requestId:'two'})).status,'failed','single image concurrency is bounded');
  assert.equal(await handlers.get('computerSearch:cancelGeneratedKeywords')({...event,sender:{id:2}},req),false);
  assert.equal(await handlers.get('computerSearch:cancelGeneratedKeywords')(event,{requestId:'other'}),false);
  assert.equal(await handlers.get('computerSearch:cancelGeneratedKeywords')(event,req),true);requestGate.resolve();assert.equal((await job).status,'cancelled');
  assert.ok(progress.every(p=>p.requestId==='one'));assert.equal(sender.listenerCount('destroyed'),0);
  console.log('Automatic keywords: bounded local model output, timeout/cancel, stable source, merge/conflict retry, limits, lifecycle and owned IPC passed.');
 }finally{await sourceClient.releaseSourceHandles();sourceClient.close();await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1});
