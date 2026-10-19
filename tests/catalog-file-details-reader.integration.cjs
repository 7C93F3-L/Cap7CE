const assert=require('node:assert/strict');
const {createCatalogFileDetailsReader}=require('../dist-electron/catalogFileDetailsReader.js');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const tick=()=>new Promise(r=>setImmediate(r));
const info=path=>({kind:'file',path,name:path,extension:'.png',size:10,modifiedAt:'2026-10-17T00:00:00Z',withinAddedDirectory:false});
const metadata={items:[{kind:'software_family',text:'photoshop'}],capturedAt:null};
(async()=>{
 let probes=0;
 const stored=createCatalogFileDetailsReader({inspect:async path=>info(path),readStored:async()=>({metadata,isCurrent:true}),
   readDimensions:async()=>({width:1024,height:768}),startProbe:()=>{probes++;throw Error('must not probe current facts')}});
 const known=await stored.read('known','known.png');assert.equal(probes,0);assert.deepEqual(known.embeddedMetadata,metadata);assert.equal(known.imageWidth,1024);
 const dimensions=deferred(),reads=[],probeDone=deferred();let cancelled=0;
 const queued=createCatalogFileDetailsReader({inspect:async path=>{reads.push(path);return info(path)},
   readStored:async()=>({metadata:null,isCurrent:false}),readDimensions:path=>path==='A.png'?dimensions.promise:Promise.resolve(null),
   startProbe:({filePath})=>filePath==='A.png'?{result:probeDone.promise,cancel:()=>{cancelled++;probeDone.resolve(null)}}:{result:Promise.resolve(metadata),cancel:()=>{}}});
 const a=queued.read('A','A.png');await tick();
 const b=queued.read('B','B.png'),c=queued.read('C','C.png');queued.cancel('A');
 assert.equal(await a,null);assert.equal(await b,null);assert.ok(cancelled>0);assert.equal(reads.includes('B.png'),false);
 dimensions.resolve(null);const latest=await c;assert.equal(latest.info.path,'C.png');assert.deepEqual(latest.embeddedMetadata,metadata);assert.equal(reads.includes('B.png'),false);
 let checks=0;
 const changed=createCatalogFileDetailsReader({inspect:async path=>({...info(path),size:++checks===1?10:20}),readStored:async()=>({metadata,isCurrent:true}),readDimensions:async()=>null});
 assert.equal(await changed.read('changed','changed.png'),null,'source revisions are checked again before publishing');
 const missing=createCatalogFileDetailsReader({inspect:async()=>{throw Error('missing')},readStored:async()=>{throw Error('must not read')}});
 assert.equal(await missing.read('missing','missing.png'),null);
 const empty=createCatalogFileDetailsReader({inspect:async path=>info(path),readStored:async()=>({metadata:null,isCurrent:true}),readDimensions:async()=>null,startProbe:()=>{throw Error('current empty metadata must not be retried')}});
 assert.equal((await empty.read('empty','empty.txt')).embeddedMetadata,undefined);
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),sharp=require('sharp');
 const {inspectSkimEntry}=require('../dist-electron/skimPreviewService.js');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'Cap7CE-details-reader-'));
 try{
   const file=path.join(temp,'source.jpg');await sharp({create:{width:12,height:8,channels:3,background:'#b0c0d0'}}).withMetadata({exif:{IFD0:{Software:'Adobe Photoshop'}}}).jpeg().toFile(file);
   const before=await fs.readFile(file);
   const {CoreVisualCacheClient}=require('../dist-electron/core/coreVisualCacheClient.js');
   const {startCorePreviewMetadataRead}=require('../dist-electron/core/corePreviewMetadataClient.js');
   const client=new CoreVisualCacheClient(path.join(temp,'profile'));
   const request=client.request.bind(client),cancel=client.requestIfActive.bind(client);
   const real=createCatalogFileDetailsReader({inspect:p=>inspectSkimEntry(p,'file',[]),readStored:async()=>({metadata:null,isCurrent:false}),
     readDimensions:p=>request('sourceDimensions',[p]),startProbe:({filePath})=>startCorePreviewMetadataRead(filePath,8000,{request,cancel})});
   try {
   const actual=await real.read('real',file);assert.equal(actual.imageWidth,12);assert.equal(actual.imageHeight,8);
   assert.ok(actual.embeddedMetadata.items.some(e=>e.kind==='software_family'&&e.text.toLowerCase().includes('photoshop')),'real preview metadata worker supplies the sidebar');
   assert.deepEqual(await fs.readFile(file),before,'detail reads preserve source bytes');
   } finally {await client.releaseSourceHandles();client.close()}
 }finally{await fs.rm(temp,{recursive:true,force:true})}
 console.log('Catalog file details: current metadata reused, latest-only bounded reads, cancellation, missing sources and revision guards passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
