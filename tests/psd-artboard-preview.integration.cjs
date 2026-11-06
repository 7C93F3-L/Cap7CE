const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {writePsdBuffer,initializeCanvas}=require('ag-psd'),{createCanvas,ImageData}=require('@napi-rs/canvas'),sharp=require('sharp');
const session=require('./support/native-session.cjs');
initializeCanvas(createCanvas,(w,h)=>new ImageData(w,h));
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cap7ce-psd-pages-'));let client;
 try {
  const runtime=path.join(root,'runtime');await fs.cp(path.resolve('artifacts/metadata-worker/v1'),runtime,{recursive:true});
  client=session(runtime,'provider-preview.cjs',path.join(root,'profile'));
  const data=new Uint8ClampedArray(160*64*4);
  for(let y=0;y<64;y++)for(let x=0;x<160;x++){const i=(y*160+x)*4;data[i]=x<80?255:0;data[i+2]=x>=80?255:0;data[i+3]=255;}
  const document={width:160,height:64,imageData:{width:160,height:64,data},children:[
   {name:'红色',artboard:{rect:{left:0,top:0,right:64,bottom:64}}},
   {name:'Blue',artboard:{rect:{left:96,top:0,right:160,bottom:64}}}]};
  for(const extension of ['psd','psb']) {
   const file=path.join(root,'boards.'+extension),original=writePsdBuffer(document,{psb:extension==='psb'});await fs.writeFile(file,original);
   const info=await client.request('psd.open',[extension,file]);assert.equal(info.pages.length,2);
   assert(info.pages.every(p=>p.width===64&&p.height===64));
   const colors=[];
   for(let page=0;page<2;page++) {
    const response=await client.request('psd.render',[extension,file,page]);
    const {data:pixel}=await sharp(Buffer.from(response.base64,'base64')).raw().toBuffer({resolveWithObject:true});
    colors.push([pixel[0],pixel[1],pixel[2]].join(','));
   }
   assert.deepEqual(colors.sort(),['0,0,255','255,0,0']);
   await assert.rejects(client.request('psd.render',[extension,file,2]),/session/);
   await client.request('psd.close',['old-session']);await client.request('psd.render',[extension,file,0]);
   await client.request('psd.close',[extension]);await assert.rejects(client.request('psd.render',[extension,file,0]),/session/);
   await fs.rename(file,file+'.moved');await fs.rename(file+'.moved',file);assert.deepEqual(await fs.readFile(file),original);
   await client.request('psd.open',['changed-'+extension,file]);await fs.appendFile(file,'changed');
   await assert.rejects(client.request('psd.render',['changed-'+extension,file,0]),/source-changed/);
  }
  const single=path.join(root,'single.psd');await fs.writeFile(single,writePsdBuffer({width:1,height:1,imageData:{width:1,height:1,data:new Uint8ClampedArray([0,0,0,255])}}));
  await assert.rejects(client.request('psd.open',['single',single]),/no-artboards/);
  const truncated=path.join(root,'truncated.psd');await fs.writeFile(truncated,Buffer.from('8BPS'));
  await assert.rejects(client.request('psd.open',['truncated',truncated]));
  await assert.rejects(client.request('psd.open',['relative','relative.psd']));
  const oversized=path.join(root,'oversized.psd'),bad=writePsdBuffer(document);bad.writeUInt32BE(50000,14);bad.writeUInt32BE(50000,18);await fs.writeFile(oversized,bad);
  await assert.rejects(client.request('psd.open',['oversized',oversized]),/format/);
  const outside=path.join(root,'outside.psd');await fs.writeFile(outside,writePsdBuffer({...document,children:[document.children[0],{name:'outside',artboard:{rect:{left:160,top:0,right:224,bottom:64}}}]}));
  await assert.rejects(client.request('psd.open',['outside',outside]),/bounds/);
  await client.request('psd.close',['revoked']);await assert.rejects(client.request('psd.open',['revoked',single]),/cancelled/);
  const cancellable=path.join(root,'cancel.psd');await fs.writeFile(cancellable,writePsdBuffer(document));
  const opening=client.request('psd.open',['cancel',cancellable]);const rejected=assert.rejects(opening,/cancelled/);
  await client.request('psd.close',['cancel']);await rejected;
  await client.request('psd.open',['release',cancellable]);await client.request('releaseSourceHandles',[]);
  await assert.rejects(client.request('psd.render',['release',cancellable,0]),/session/);
  await client.request('psd.open',['eof',cancellable]);await client.close();client=undefined;
  console.log('PSD/PSB actual pages, standalone RPC, source changes, fallback, cancellation, stale close and release passed.');
 }finally{if(client)await client.close();await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
