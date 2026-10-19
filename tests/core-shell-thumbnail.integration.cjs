const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const sharp=require('sharp'),{app,nativeImage}=require('electron');
const {requestCoreShellThumbnail}=require('../dist-electron/core/coreShellThumbnail.js');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
app.whenReady().then(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'cap7ce-core-thumbnail-'));
  try{
    const executable=path.join(root,'Cap7CE.Core.Visuals.exe');
    await fs.copyFile(path.resolve('native/artifacts/core-visuals/v1/Cap7CE.Core.Visuals.exe'),executable);
    const width=127,height=81,raw=Buffer.alloc(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;raw[i]=x*2;raw[i+1]=y*3;raw[i+2]=(x+y)%256;raw[i+3]=x<20?0:x<70?128:255}
    const source=sharp(raw,{raw:{width,height,channels:4}}),files=[];
    for(const [extension,encode]of[['png',image=>image.png()],['jpg',image=>image.flatten({background:'#28394a'}).jpeg()],['tif',image=>image.tiff()]]){
      const file=path.join(root,`测试 ${extension}.${extension}`);await encode(source.clone()).toFile(file);files.push(file);
    }
    const stride=Math.ceil(width*3/4)*4,bmp=Buffer.alloc(54+stride*height);bmp.write('BM');bmp.writeUInt32LE(bmp.length,2);bmp.writeUInt32LE(54,10);bmp.writeUInt32LE(40,14);bmp.writeInt32LE(width,18);bmp.writeInt32LE(height,22);bmp.writeUInt16LE(1,26);bmp.writeUInt16LE(24,28);bmp.writeUInt32LE(stride*height,34);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,o=54+(height-1-y)*stride+x*3;bmp[o]=raw[i+2];bmp[o+1]=raw[i+1];bmp[o+2]=raw[i]}
    const bmpFile=path.join(root,'测试 24位.bmp');await fs.writeFile(bmpFile,bmp);files.push(bmpFile);
    for(const [name,alpha]of[['transparent',0],['opaque',255]]){const file=path.join(root,name+'.png');await sharp({create:{width:31,height:17,channels:4,background:{r:64,g:128,b:192,alpha:alpha/255}}}).png().toFile(file);files.push(file)}
    const hashes=await Promise.all(files.map(async file=>digest(await fs.readFile(file))));let compared=0,maximumDelta=0;
    for(const file of files)for(const edge of [24,77,300])for(const phase of ['cold','warm']){
      let referencePath=file,actualPath=file;
      if(phase==='cold'){
        const extension=path.extname(file),stem=path.basename(file,extension);
        referencePath=path.join(root,`${stem}-${edge}-reference${extension}`);actualPath=path.join(root,`${stem}-${edge}-core${extension}`);
        await fs.copyFile(file,referencePath);await fs.copyFile(file,actualPath);
      }else{
        // Windows may publish a different cached upscale after the first extraction; warm both comparisons equally.
        await nativeImage.createThumbnailFromPath(file,{width:edge,height:edge});
      }
      const expected=await nativeImage.createThumbnailFromPath(referencePath,{width:edge,height:edge});assert.equal(expected.isEmpty(),false);
      const actual=await requestCoreShellThumbnail(actualPath,edge,executable);
      const [reference,result]=await Promise.all([sharp(expected.toPNG()).ensureAlpha().raw().toBuffer({resolveWithObject:true}),sharp(actual).ensureAlpha().raw().toBuffer({resolveWithObject:true})]);
      assert.deepEqual(result.info,reference.info,`${path.extname(file)} ${edge} dimensions`);
      for(let i=0;i<result.data.length;i+=4){
        assert.ok(Math.abs(result.data[i+3]-reference.data[i+3])<=1,`alpha at ${i/4}`);
        for(let channel=0;channel<3;channel++){
          const a=Math.round(result.data[i+channel]*result.data[i+3]/255),b=Math.round(reference.data[i+channel]*reference.data[i+3]/255),delta=Math.abs(a-b);
          maximumDelta=Math.max(maximumDelta,delta);assert.ok(delta<=1,`${path.extname(file)} ${edge} visible channel difference ${delta}`);
        }
      }
      compared++;
    }
    assert.deepEqual(await Promise.all(files.map(async file=>digest(await fs.readFile(file)))),hashes);
    await assert.rejects(requestCoreShellThumbnail(path.join(root,'missing.png'),300,executable),error=>error.code==='CORE_THUMBNAIL_UNAVAILABLE');
    await assert.rejects(requestCoreShellThumbnail(files[0],0));await assert.rejects(requestCoreShellThumbnail(files[0],4097));
    console.log(JSON.stringify({nativeThumbnailParity:true,compared,maximumVisibleChannelDelta:maximumDelta,phases:['cold','warm'],formats:['png-alpha','jpeg','tiff','bmp24','transparent','opaque'],sourceBytesUnchanged:true}));
  }finally{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('cap7ce-core-thumbnail-'));await fs.rm(root,{recursive:true,force:true});app.quit()}
}).catch(error=>{console.error(error);app.exit(1)});
