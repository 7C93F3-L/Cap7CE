const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto'),sharp=require('sharp');
const {CoreVisualCacheClient}=require('../dist-electron/core/coreVisualCacheClient.js');
const {generateImageKeywords}=require('../dist-electron/catalogAutoKeywordModel.js');
const {fingerprintKeywordSource}=require('../dist-electron/catalogAutoKeywordSource.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),until=async predicate=>{for(let n=0;n<200;n++){if(await predicate())return;await sleep(10)}throw Error('local keyword test timeout')};
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cap7ce-local-keywords-'));let client,server,proxy;
 const variables=['PATH','NODE_USE_ENV_PROXY','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy'],saved=Object.fromEntries(variables.map(key=>[key,process.env[key]]));
 const holds=new Map(),requests=[];let mode='valid',proxyHits=0,redirectHits=0;
 try{
  const runtime=path.join(root,'独立 Core'),supervisor=path.join(root,'Cap7CE.Core.Visuals.exe'),profile=path.join(root,'profile');
  await fs.cp('artifacts/metadata-worker/v1',runtime,{recursive:true});await fs.copyFile('native/artifacts/core-visuals/v1/Cap7CE.Core.Visuals.exe',supervisor);
  server=http.createServer(async(req,res)=>{try{
   if(req.url==='/redirected'){redirectHits++;res.end('{}');return}
   let text='';for await(const bytes of req)text+=bytes;const body=JSON.parse(text);requests.push(body);
   if(mode==='hold'){holds.set(body.model,res);res.once('close',()=>holds.delete(body.model));return}
   if(mode==='redirect'){res.writeHead(307,{Location:`http://127.0.0.1:${server.address().port}/redirected`});res.end();return}
   if(mode==='status'){res.writeHead(503);res.end();return}
   if(mode==='large'){res.end(' '.repeat(1024*1024+1));return}
   if(mode==='broken'){res.setHeader('Content-Length','200');res.write('{');res.destroy();return}
   res.setHeader('Content-Type','application/json');res.end(mode==='invalid'?'not-json':JSON.stringify({choices:[{message:{content:'<think>hidden</think>["天空"," 蓝色 ","天空"]'}}]}));
  }catch{res.destroy()}});
  proxy=http.createServer((_req,res)=>{proxyHits++;res.writeHead(502);res.end()});
  await Promise.all([new Promise(r=>server.listen(0,'127.0.0.1',r)),new Promise(r=>proxy.listen(0,'127.0.0.1',r))]);
  const proxyUrl=`http://127.0.0.1:${proxy.address().port}`;
  for(const key of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'])process.env[key]=proxyUrl;
  process.env.NO_PROXY='';process.env.no_proxy='';process.env.NODE_USE_ENV_PROXY='1';process.env.PATH='';
  client=new CoreVisualCacheClient(profile,path.join(runtime,'node.exe'),path.join(runtime,'visual-cache.cjs'),supervisor);
  const request=client.request.bind(client),cancel=client.requestIfActive.bind(client),transport={request,cancel};
  const connection={baseUrl:`http://127.0.0.1:${server.address().port}`,modelName:'fixture'},image='data:image/jpeg;base64,'+(await sharp({create:{width:8,height:6,channels:3,background:'#12a0d0'}}).jpeg().toBuffer()).toString('base64');
  const generate=async(name='fixture',timeout=1000,signal=new AbortController().signal)=>generateImageKeywords({...connection,modelName:name},image,signal,timeout,transport);
  assert.deepEqual(await generate(),['天空','蓝色']);assert.equal(proxyHits,0,'Core never sends image bytes through configured proxy');
  assert.equal(requests[0].messages[0].content[0].image_url.url,image);assert.equal(requests[0].max_tokens,512);assert.equal(requests[0].temperature,.2);assert.equal(requests[0].stream,false);assert.equal(requests[0].chat_template_kwargs.enable_thinking,false);
  assert.match(requests[0].messages[0].content[1].text,/中文关键词/,'legacy requests retain Chinese output');
  await request('localKeywords.generate',[crypto.randomUUID(),connection,image,1000,'en-US']);
  assert.match(requests.at(-1).messages[0].content[1].text,/short English keywords/);
  await request('localKeywords.generate',[crypto.randomUUID(),connection,image,1000,'zh-CN']);
  assert.match(requests.at(-1).messages[0].content[1].text,/中文关键词/);
  for(const language of ['system','fr-FR',null,{},1])await assert.rejects(request('localKeywords.generate',[crypto.randomUUID(),connection,image,1000,language]),/invalid-request/);
  const source=path.join(root,'源文件.jpg');await fs.writeFile(source,Buffer.from(image.slice(23),'base64'));const original=await fs.readFile(source),stat=await fs.lstat(source,{bigint:true});
  const item={path:source,fileReference:stat.ino.toString(16).padStart(16,'0'),createdUtcTicks:null,createdFileTimeMilliseconds:String(stat.birthtimeNs/1000000n+11644473600000n)};
  const fingerprint=await fingerprintKeywordSource(item,request);await assert.rejects(fingerprintKeywordSource({...item,fileReference:'0000000000000001'},request),/变化/);
  await assert.rejects(fingerprintKeywordSource({...item,createdFileTimeMilliseconds:'1'},request),/变化/);
  await fs.utimes(source,1700000000,1700000000);assert.notEqual(await fingerprintKeywordSource(item,request),fingerprint);
  await assert.rejects(fs.access(profile),'model/fingerprint do not initialize any persistent cache/index');
  const before=requests.length;
  for(const baseUrl of ['https://127.0.0.1:1','http://localhost:1','http://127.0.0.1:65536','http://127.0.0.1:0','http://127.0.0.1:01','http://127.0.0.1:1/path','http://127.0.0.1:1?x','http://user@127.0.0.1:1','http://127.0.0.1.evil:1'])
   await assert.rejects(request('localKeywords.generate',[crypto.randomUUID(),{...connection,baseUrl},image,1000]),/invalid-request/);
  for(const args of [[crypto.randomUUID(),{...connection,extra:1},image,1000],[crypto.randomUUID(),connection,'data:image/jpeg;base64,not-base64',1000],[crypto.randomUUID(),connection,image,120001],['bad',connection,image,1000]])
   await assert.rejects(request('localKeywords.generate',args),/invalid-request/);
  await assert.rejects(request('localKeywords.fingerprint',[{...item,path:'relative.jpg'}]),/invalid-request/);assert.equal(requests.length,before);
  mode='hold';const ids=[crypto.randomUUID(),crypto.randomUUID()],active=ids.map((id,i)=>request('localKeywords.generate',[id,{...connection,modelName:'held-'+i},image,10000,i===0?'en-US':'zh-CN']));for(const task of active)void task.catch(()=>undefined);
  await until(()=>holds.size===2);await assert.rejects(request('localKeywords.generate',[crypto.randomUUID(),connection,image,1000]),/繁忙/);
  assert.match(requests.find(body=>body.model==='held-0').messages[0].content[1].text,/short English keywords/);
  assert.match(requests.find(body=>body.model==='held-1').messages[0].content[1].text,/中文关键词/);
  const began=Date.now();assert.equal((await request('stats')).cacheCount,0);await client.releaseSourceHandles();assert.ok(Date.now()-began<3000,'in-memory model jobs do not block cache or source-handle release');assert.equal(holds.size,2);
  for(let i=0;i<ids.length;i++){await cancel('localKeywords.cancel',[ids[i]]);await assert.rejects(active[i],/cancelled/)}await until(()=>holds.size===0);
  await assert.rejects(request('localKeywords.generate',[crypto.randomUUID(),connection,image,40]),/超时/);await until(()=>holds.size===0);
  const abort=new AbortController(),aborted=generate('aborted',10000,abort.signal);await until(()=>holds.has('aborted'));abort.abort();await assert.rejects(aborted,/cancelled/);await until(()=>holds.size===0);
  for(const next of ['invalid','large','status','redirect','broken']){mode=next;await assert.rejects(generate());mode='valid';assert.deepEqual(await generate(),['天空','蓝色'])}
  assert.equal(redirectHits,0,'Core never follows model redirects');assert.equal(proxyHits,0);assert.deepEqual(await fs.readFile(source),original,'model and source validation preserve generated image bytes');
  assert.equal((await request('stats')).cacheCount,0);assert.deepEqual(await fs.readdir(path.join(profile,'model-inputs')),[],'model input remains in memory');
  let sent=0,cancelled=0,late;
  const heldTransport={request:async()=>{sent++;return new Promise(r=>late=r)},cancel:async()=>{cancelled++;return null}};
  const earlySignal=new AbortController();earlySignal.abort();await assert.rejects(generateImageKeywords(connection,image,earlySignal.signal,1000,heldTransport),/cancelled/);assert.equal(sent,0);
  const delayedSignal=new AbortController(),delayed=generateImageKeywords(connection,image,delayedSignal.signal,1000,heldTransport);await until(()=>sent===1);
  delayedSignal.abort();await assert.rejects(delayed,/cancelled/);assert.equal(cancelled,1);late(['迟到']);await sleep(5);
  for(const reply of [null,{},Array(21).fill('tag'),['bad\nword']])await assert.rejects(generateImageKeywords(connection,image,new AbortController().signal,1000,{request:async()=>reply,cancel:heldTransport.cancel}),/有效关键词/);
  mode='hold';const closing=request('localKeywords.generate',[crypto.randomUUID(),{...connection,modelName:'close-active'},image,10000]);void closing.catch(()=>undefined);
  await until(()=>holds.has('close-active'));client.close();await assert.rejects(closing,/unavailable/);await until(()=>holds.size===0);
  client=new CoreVisualCacheClient(profile,path.join(runtime,'node.exe'),path.join(runtime,'visual-cache.cjs'),supervisor);
  mode='valid';assert.deepEqual(await client.request('localKeywords.generate',[crypto.randomUUID(),connection,image,1000]),['天空','蓝色']);
  assert.equal(requests.filter(body=>body.model==='close-active').length,1,'retired model requests are never replayed by the replacement');
  console.log('Core local keywords: standalone copied runtime/empty PATH/no Electron, literal loopback/no proxy or redirects, original prompt/grammar, bounded HTTP and jobs, cancellation/deadline/socket recovery, source identity and no persistent AI image passed.');
 }finally{
  client?.close();for(const key of variables)if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];
  for(const res of holds.values())res.destroy();for(const service of [server,proxy])if(service){service.closeAllConnections();await new Promise(r=>service.close(r))}
  await sleep(150);assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('cap7ce-local-keywords-'));await fs.rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
