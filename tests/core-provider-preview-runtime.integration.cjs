const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),sharp=require('sharp');
const {zipSync,strToU8}=require('fflate'),{CoreVisualCacheClient}=require('../dist-electron/core/coreVisualCacheClient.js');
const {createPdf,makeMobi,createOpenTypeFixture}=require('./provider-preview-fixtures.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cap7ce-provider-runtime-')),runtime=path.join(root,'独立 预览'),supervisor=path.join(root,'Cap7CE.Core.Visuals.exe');let client,ownedPid,ownedScratch;const originalPath=process.env.PATH,deadline=setTimeout(()=>{throw Error('Core preview integration deadline');},60000);
 const until=async read=>{for(let i=0;i<200;i++){if(await read())return;await sleep(10)}throw Error('Core preview fixture timeout');};
 try{
  await fs.cp('artifacts/metadata-worker/v1',runtime,{recursive:true});await fs.copyFile('native/artifacts/core-visuals/v1/Cap7CE.Core.Visuals.exe',supervisor);
  const png=await sharp({create:{width:20,height:30,channels:3,background:'#abc'}}).png().toBuffer();
  const font=path.join(root,'字体.otf'),pdf=path.join(root,'分页.pdf'),mobi=path.join(root,'电子书.mobi'),epub=path.join(root,'书籍.epub'),zip=path.join(root,'只读.zip');
  await Promise.all([fs.writeFile(font,createOpenTypeFixture()),fs.writeFile(pdf,createPdf(2)),fs.writeFile(mobi,makeMobi()),fs.writeFile(zip,zipSync({'文档.txt':strToU8('generated')})),fs.writeFile(epub,zipSync({mimetype:strToU8('application/epub+zip'),'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>'),'content.opf':strToU8('<package><metadata><title>独立书籍</title></metadata><manifest><item id="c" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/></manifest><spine><itemref idref="c"/></spine></package>'),'chapter.xhtml':strToU8('<html><body><p>本地正文</p></body></html>'),'cover.png':png}))]);
  const files=[font,pdf,mobi,epub,zip],before=await Promise.all(files.map(hash));process.env.PATH='';
  client=new CoreVisualCacheClient(root,path.join(runtime,'node.exe'),path.join(runtime,'provider-preview.cjs'),supervisor);const request=client.request.bind(client);
  assert.match((await request('font.open',['font',font,'zh-CN'])).familyName,/Cap7CE/);assert.equal((await request('pdf.open',['pdf',pdf,pdf])).pageCount,2);
  const first=await request('pdf.render',['pdf',pdf,1]),cached=await request('pdf.render',['pdf',pdf,1]);assert.deepEqual(cached,first);assert.equal(Buffer.from(first.base64,'base64').subarray(1,4).toString(),'PNG');
  await assert.rejects(request('pdf.render',['wrong',pdf,1]));await assert.rejects(request('pdf.render',['pdf',font,1]));
  assert.match((await request('mobi.open',['mobi',mobi])).chapters[0].text,/安全正文/);const book=await request('epub.open',['epub',epub]);assert.equal(book.title,'独立书籍');assert.match(book.coverDataUrl,/^data:image\/png;base64,/);
  assert.equal((await request('archive.open',['zip',zip])).entries[0].path,'文档.txt');await assert.rejects(request('unrecognized',['x']));await assert.rejects(request('font.open',['bad',font,'bad']));await assert.rejects(request('epub.open',['bad','relative.epub']));
  await client.releaseSourceHandles();assert.deepEqual(await request('pdf.render',['pdf',pdf,1]),first,'source release preserves already loaded PDF page state');assert.deepEqual(await Promise.all(files.map(hash)),before);
  const worker=path.join(runtime,'fontMetadataWorker.js'),saved=await fs.readFile(worker),marker=path.join(root,'owned.json');
  await fs.writeFile(worker,`const{workerData}=require('node:worker_threads'),fs=require('node:fs');fs.openSync(workerData.sourcePath,'r');fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid,scratch:process.env.CAP7CE_CORE_SCRATCH_ROOT}));console.log('decoder output is isolated');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);`);
  const held=request('font.open',['held',font,'en-US']);void held.catch(()=>{});await until(async()=>{try{await fs.access(marker);return true}catch{return false}});
  assert.equal((await request('font.inspect',[font])).size,(await fs.stat(font)).size,'held decoder cannot block the owner');await client.releaseSourceHandles();await assert.rejects(held,error=>error.code==='ECANCELED');
  await fs.writeFile(worker,saved);assert.match((await request('font.open',['recovered',font,'en-US'])).familyName,/Cap7CE/);
  await fs.writeFile(worker,`const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid,scratch:process.env.CAP7CE_CORE_SCRATCH_ROOT}));Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);`);await fs.rm(marker);
  const killed=request('font.open',['killed',font,'en-US']);void killed.catch(()=>{});await until(async()=>{try{await fs.access(marker);return true}catch{return false}});({pid:ownedPid,scratch:ownedScratch}=JSON.parse(await fs.readFile(marker,'utf8')));
  assert.equal(typeof ownedScratch,'string');assert.ok(path.isAbsolute(ownedScratch));
  client.close();await assert.rejects(killed);await until(()=>{try{process.kill(ownedPid,0);return false}catch{return true}});await until(async()=>{try{await fs.access(ownedScratch);return false}catch{return true}});
  console.log('Core provider preview: copied runtime outside repository/empty PATH/no Electron, PDF render/cache/authorization, font, EPUB cover, MOBI ESM, read-only ZIP, malformed calls, held-worker release/recovery and killed-owner scratch cleanup passed.');
 }finally{clearTimeout(deadline);if(originalPath===undefined)delete process.env.PATH;else process.env.PATH=originalPath;client?.close();await sleep(150);assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('cap7ce-provider-runtime-'));await fs.rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
})().catch(error=>{console.error(error);process.exitCode=1});
