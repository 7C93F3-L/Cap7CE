const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),sharp=require('sharp');
const {CoreVisualCacheClient}=require('../dist-electron/core/coreVisualCacheClient.js');
const {startCorePreviewMetadataRead}=require('../dist-electron/core/corePreviewMetadataClient.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),digest=async p=>crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cap7ce-preview-runtime-'));let client;const savedPath=process.env.PATH;
 try{
  const runtime=path.join(root,'独立 运行时'),profile=path.join(root,'profile'),supervisor=path.join(root,'Cap7CE.Core.Visuals.exe');
  await fs.cp('artifacts/metadata-worker/v1',runtime,{recursive:true});await fs.copyFile('native/artifacts/core-visuals/v1/Cap7CE.Core.Visuals.exe',supervisor);
  const image=path.join(root,'素材 中文.jpg'),pdf=path.join(root,'目录.pdf'),text=path.join(root,'unsupported.txt');
  await sharp({create:{width:12,height:8,channels:3,background:'#b0c0d0'}}).withMetadata({exif:{IFD0:{Software:'Adobe Photoshop'}}}).jpeg().toFile(image);
  await fs.writeFile(pdf,`%PDF-1.4\n<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">中文海报</rdf:li></rdf:Alt></dc:title></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`);
  await fs.writeFile(text,'generated fixture only');const sources=[image,pdf,text],before=await Promise.all(sources.map(digest));
  client=new CoreVisualCacheClient(profile,path.join(runtime,'node.exe'),path.join(runtime,'visual-cache.cjs'),supervisor);process.env.PATH='';
  const request=client.request.bind(client),cancel=client.requestIfActive.bind(client),read=source=>startCorePreviewMetadataRead(source,8000,{request,cancel}).result;
  const metadata=await read(image);assert.ok(metadata.items.some(item=>item.kind==='software_family'&&item.text.includes('photoshop')));
  assert.ok((await read(pdf)).items.some(item=>item.kind==='embedded_title'&&item.text.includes('中文海报')));
  assert.equal(await read(text),null);assert.equal(await read(path.join(root,'missing.jpg')),null);
  await assert.rejects(request('previewMetadata',['bad',image]),/invalid-request/);await assert.rejects(request('previewMetadata',[crypto.randomUUID(),'relative.jpg']),/invalid-request/);
  await assert.rejects(request('previewMetadata',[crypto.randomUUID(),image,'extra']),/invalid-request/);
  await assert.rejects(fs.access(profile),'transient metadata must not create an index or persistent cache');
  assert.deepEqual(await request('sourceDimensions',[image]),{width:12,height:8});await client.releaseSourceHandles();
  const decoder=path.join(runtime,'preview-metadata.cjs'),saved=await fs.readFile(decoder),ready=path.join(root,'ready.json');
  await fs.writeFile(decoder,`const{workerData}=require('node:worker_threads');require('node:fs').writeFileSync(${JSON.stringify(ready)},JSON.stringify({source:workerData}));console.log('no framing corruption');while(true){}`);
  const id=crypto.randomUUID(),blocked=request('previewMetadata',[id,image]);void blocked.catch(()=>undefined);
  for(let i=0;i<150;i++){try{await fs.access(ready);break}catch{await sleep(10)}}await fs.access(ready);
  const began=Date.now();assert.equal((await request('stats')).cacheCount,0);assert.ok(Date.now()-began<3000,'synchronous metadata parser cannot block the cache owner');
  await cancel('cancelPreviewMetadata',[id]);assert.equal(await blocked,null);await fs.writeFile(decoder,saved);
  assert.ok((await read(image)).items.length);await client.releaseSourceHandles();
  const renamed=path.join(root,'renamed.jpg');await fs.rename(image,renamed);await fs.rename(renamed,image);
  assert.deepEqual(await Promise.all(sources.map(digest)),before,'generated sources remain byte-for-byte intact');
  const cold=new CoreVisualCacheClient(profile,path.join(root,'missing-node.exe'));assert.equal(await cold.requestIfActive('cancelPreviewMetadata',[crypto.randomUUID()]),null);cold.close();
  console.log('Core preview runtime: copied resources outside repository/empty PATH/no Electron, real EXIF/XMP, no persistent publication, protocol bounds, hung-thread cancellation, responsive owner, restart and source integrity passed.');
 }finally{
  if(savedPath===undefined)delete process.env.PATH;else process.env.PATH=savedPath;
  client?.close();await sleep(150);
  assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('cap7ce-preview-runtime-'));await fs.rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
