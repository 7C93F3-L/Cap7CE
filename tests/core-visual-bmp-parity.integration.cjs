const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const sharp=require('sharp'),{app,nativeImage}=require('electron');
const root=require('node:fs').mkdtempSync(path.join(os.tmpdir(),'cap7ce-visual-bmp-'));app.setPath('userData',path.join(root,'profile'));
const makeBmp=(width,height,alpha)=>{
 const header=alpha?124:40,bits=alpha?32:24,stride=Math.ceil(width*bits/8/4)*4,offset=14+header,buffer=Buffer.alloc(offset+stride*height);
 buffer.write('BM');buffer.writeUInt32LE(buffer.length,2);buffer.writeUInt32LE(offset,10);buffer.writeUInt32LE(header,14);buffer.writeInt32LE(width,18);buffer.writeInt32LE(height,22);buffer.writeUInt16LE(1,26);buffer.writeUInt16LE(bits,28);buffer.writeUInt32LE(stride*height,34);
 if(alpha){buffer.writeUInt32LE(3,30);for(const[value,position]of[[0x00ff0000,54],[0x0000ff00,58],[0x000000ff,62],[0xff000000,66],[0x57696e20,70]])buffer.writeUInt32LE(value,position)}
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=offset+(height-1-y)*stride+x*(bits/8);buffer[i]=(x*7+y*13)%256;buffer[i+1]=Math.round(y*255/(height-1));buffer[i+2]=Math.round(x*255/(width-1));if(alpha)buffer[i+3]=x<width/4?0:x<width/2?128:255}
 return buffer;
};
app.whenReady().then(async()=>{try{
 const visual=require('../dist-electron/visualRenderService.js'),results=[];
 for(const alpha of[false,true])for(const mode of['thumbnail','model']){
  const bytes=makeBmp(127,81,alpha),reference=path.join(root,`reference-${alpha}-${mode}.bmp`),source=path.join(root,`source-${alpha}-${mode}.bmp`);
  await fs.writeFile(reference,bytes);await fs.writeFile(source,bytes);
  const legacy=await nativeImage.createThumbnailFromPath(reference,{width:127,height:127});assert.equal(legacy.isEmpty(),false);
  const expected=mode==='model'?legacy.toJPEG(90):legacy.toPNG(),actual=mode==='model'?(await visual.prepareTemporaryModelInputImage(source)).buffer:await fs.readFile(await visual.ensureSkimThumbnailPath(source));
  const [golden,current]=await Promise.all([sharp(expected).ensureAlpha().raw().toBuffer({resolveWithObject:true}),sharp(actual).ensureAlpha().raw().toBuffer({resolveWithObject:true})]);
  assert.deepEqual(current.info,golden.info);let sum=0,maximum=0;
  for(let i=0;i<current.data.length;i++){const delta=Math.abs(current.data[i]-golden.data[i]);sum+=delta*delta;maximum=Math.max(maximum,delta)}
  const rmse=Math.sqrt(sum/current.data.length);results.push({alpha,mode,rmse,maximum});console.log(JSON.stringify(results.at(-1)));
  assert.ok(rmse<=2,`legacy BMP ${mode} pixel RMSE ${rmse}`);
  assert.equal(crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex'),crypto.createHash('sha256').update(bytes).digest('hex'));
 }
 await visual.releaseVisualRenderFileHandles();
 const inputs=path.join(root,'profile','model-inputs');assert.deepEqual(await fs.readdir(inputs),[],'temporary model JPEG remains in memory');
 console.log(JSON.stringify({legacyBmpEncodingParity:true,cases:results,temporaryModelInputUnpublished:true}));
}finally{
 require('../dist-electron/visualCacheService.js').closeVisualCacheOwner();
 assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('cap7ce-visual-bmp-'));await fs.rm(root,{recursive:true,force:true});app.quit();
}}).catch(error=>{console.error(error);app.exit(1)});
