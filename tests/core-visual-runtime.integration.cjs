const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const sharp=require('sharp'),{zipSync}=require('fflate'),{writePsd}=require('ag-psd');
const {CoreVisualCacheClient}=require('../dist-electron/core/coreVisualCacheClient.js');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const digest=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const pdf=()=>{
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 120 60] /Resources <<>> >>'];
 let result='%PDF-1.4\n',offsets=[];objects.forEach((value,index)=>{offsets.push(Buffer.byteLength(result));result+=`${index+1} 0 obj\n${value}\nendobj\n`});
 const start=Buffer.byteLength(result);return Buffer.from(result+`xref\n0 4\n0000000000 65535 f \n${offsets.map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
};
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cap7ce-core-visual-runtime-'));let client,managedScratch;
 try{
  const runtime=path.join(root,'独立 运行时'),profile=path.join(root,'profile');
  await fs.cp(path.resolve('artifacts/metadata-worker/v1'),runtime,{recursive:true});
  const executable=path.join(runtime,'node.exe'),supervisor=path.join(runtime,'Cap7CE.Core.Visuals.exe');
  await fs.copyFile(path.resolve('native/artifacts/core-visuals/v1/Cap7CE.Core.Visuals.exe'),supervisor);
  client=new CoreVisualCacheClient(profile,executable,path.join(runtime,'visual-cache.cjs'),supervisor);
  const image=path.join(root,'source.png'),rotated=path.join(root,'rotated.jpg'),svg=path.join(root,'vector.svg'),document=path.join(root,'document.pdf'),psd=path.join(root,'artboards.psd'),cdr=path.join(root,'drawing.cdr'),eps=path.join(root,'embedded.eps');
  await sharp({create:{width:3000,height:2000,channels:4,background:{r:30,g:100,b:210,alpha:.5}}}).png().toFile(image);
  await sharp({create:{width:40,height:80,channels:3,background:'#3679ac'}}).jpeg().withMetadata({orientation:6}).toFile(rotated);
  await fs.writeFile(svg,'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="24"><rect width="32" height="24" fill="#33aa55"/></svg>');await fs.writeFile(document,pdf());
  const data=new Uint8ClampedArray(200*100*4);for(let i=0;i<data.length;i+=4){data[i]=220;data[i+1]=45;data[i+2]=65;data[i+3]=255}
  await fs.writeFile(psd,Buffer.from(writePsd({width:200,height:100,imageData:{width:200,height:100,data},artboards:{count:2},children:[
   {name:'A',artboard:{rect:{top:0,left:0,bottom:100,right:100}},children:[]},{name:'B',artboard:{rect:{top:0,left:100,bottom:100,right:200}},children:[]}
  ]})));
  // Preserve the valid PSD body while selecting the existing large-file artboard-worker path.
  await fs.truncate(psd,128*1024*1024+1);
  const small=await sharp({create:{width:20,height:10,channels:4,background:'#2266bb'}}).png().toBuffer();
  await fs.writeFile(cdr,Buffer.from(zipSync({'previews/thumbnail.png':small})));
  const tiff=await sharp(small).tiff({compression:'none'}).toBuffer(),header=Buffer.alloc(30);Buffer.from([0xc5,0xd0,0xd3,0xc6]).copy(header);header.writeUInt32LE(30,20);header.writeUInt32LE(tiff.length,24);await fs.writeFile(eps,Buffer.concat([header,tiff]));
  const originals=[image,rotated,svg,document,psd,cdr,eps],hashes=await Promise.all(originals.map(digest));
  const savedPath=process.env.PATH;process.env.PATH='';
  try{
   const expected=[[image,300,200],[rotated,80,40],[svg,32,24],[document,300,150],[psd,100,100],[cdr,20,10],[eps,300,150]];
   for(const[file,width,height]of expected){
    const result=await client.request('ensure',[file,'skim-thumbnail']),metadata=await sharp(result.imagePath).metadata();
    assert.equal(metadata.width,width,path.extname(file)+' width');assert.equal(metadata.height,height,path.extname(file)+' height');assert.equal(metadata.format,'png');
    const first=await fs.stat(result.imagePath);await client.request('ensure',[file,'skim-thumbnail']);assert.equal((await fs.stat(result.imagePath)).mtimeMs,first.mtimeMs,'cached result is reused');
   }
   assert.deepEqual(await client.request('sourceDimensions',[rotated]),{width:80,height:40});assert.equal(await client.request('sourcePreview',[rotated]),true);
   assert.equal(await client.request('sourcePreview',[document]),false);
   const temporary=await client.request('temporaryImage',[image]),metadata=await sharp(Buffer.from(temporary.base64,'base64')).metadata();
   assert.equal(temporary.mimeType,'image/jpeg');assert.equal(metadata.width,1536);assert.equal(metadata.height,1024);
   assert.deepEqual(await fs.readdir(path.join(profile,'model-inputs')),[],'temporary AI JPEG has no persistent input');
   const shell=await client.request('ensureShell',[image,'skim-shell-preview']);assert.equal((await sharp(shell.imagePath).metadata()).width,1200);
   const failure=path.join(root,'bad.png');await fs.writeFile(failure,'not an image');await assert.rejects(client.request('ensure',[failure,'skim-thumbnail']));
   await client.request('releaseSourceHandles');const renamed=path.join(root,'renamed.png');await fs.rename(image,renamed);await fs.rename(renamed,image);
   // A synchronous decoder hang must not block the independent cache owner or poison later requests.
   const decoder=path.join(runtime,'visual-render.cjs'),savedDecoder=await fs.readFile(decoder),ready=path.join(root,'blocked.json'),blockedSource=path.join(root,'blocked.png');
   await fs.copyFile(image,blockedSource);
   await fs.writeFile(decoder,`process.stdin.once('data',()=>{require('fs').writeFileSync(${JSON.stringify(ready)},JSON.stringify({pid:process.pid,scratch:process.env.CAP7CE_CORE_SCRATCH_ROOT}));while(true){}});`);
   const blocked=client.request('ensure',[blockedSource,'skim-thumbnail']);void blocked.catch(()=>undefined);let processInfo;
   for(let attempt=0;attempt<100;attempt++){try{processInfo=JSON.parse(await fs.readFile(ready,'utf8'));break}catch{await sleep(20)}}
   assert.ok(processInfo?.pid);managedScratch=processInfo.scratch;
   const began=Date.now();await client.request('stats');assert.ok(Date.now()-began<3000,'cache metadata stays responsive while a decoder is blocked');
   process.kill(processInfo.pid);await assert.rejects(blocked,/core-visual-worker-exited/);await client.request('releaseSourceHandles');await fs.writeFile(decoder,savedDecoder);
   assert.equal((await client.request('temporaryImage',[image])).mimeType,'image/jpeg','a fresh decoder recovers');await client.request('releaseSourceHandles');
  }finally{if(savedPath===undefined)delete process.env.PATH;else process.env.PATH=savedPath}
  assert.deepEqual(await Promise.all(originals.map(digest)),hashes,'all generated source bytes survive Core rendering');
  const noRuntime=new CoreVisualCacheClient(profile,path.join(root,'missing.exe'),path.join(root,'missing.cjs'),supervisor);await noRuntime.releaseSourceHandles();noRuntime.close();
  console.log('Core visual runtime: copied standalone resources/empty PATH, PNG/EXIF/SVG/PDF/large PSD artboard thread/CDR/EPS/native Shell, cache reuse, 1536px temporary JPEG, handle release and generated-source integrity passed.');
 }finally{
  client?.close();await sleep(150);
  if(managedScratch){for(let attempt=0;attempt<100;attempt++){try{await fs.access(managedScratch);await sleep(20)}catch{break}}await assert.rejects(fs.access(managedScratch),'native owner removes its own entire temporary workspace');}
  assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('cap7ce-core-visual-runtime-'));await fs.rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
