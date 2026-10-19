const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'Cap7CE-extractor-definitions-'));
 try{
  const specifications=await require('../scripts/metadata-extractor-manifest.cjs')(root,output);
  const expected=require('../dist-electron/metadataExtraction/metadataBuildSpecifications.js').metadataBuildSpecifications;
  assert.deepEqual(specifications,expected,'fresh source bundle and compiled controller use exactly the same table');
  const actual=JSON.parse(await fs.readFile(path.join(root,'artifacts/metadata-worker/v1/extractors.json'),'utf8'));
  assert.deepEqual(actual,{version:1,specifications:expected},'actual independent resource retains every version and extension');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(output,'extractors.json'),'utf8')),actual);
  assert.deepEqual(specifications.map(item=>item.kind),[0,1,2,3,4,5,6,7,8]);
  assert.equal(require('../dist-electron/metadataExtraction/imageMetadataMetrics.js').CORE_IMAGE_METADATA_EXTRACTOR_VERSION,specifications[0].extractorVersion);
  assert.equal(require('../dist-electron/metadataExtraction/videoMetadataFrames.js').CORE_VIDEO_METADATA_EXTRACTOR_VERSION,specifications[1].extractorVersion);
  assert.deepEqual(await fs.readdir(output),['extractors.json'],'only the generated application resource is emitted');
  console.log('Extractor manifest: single source table, legacy exports and actual standalone resource match all nine providers.');
 }finally{assert.equal(path.dirname(output),path.resolve(os.tmpdir()));assert.ok(path.basename(output).startsWith('Cap7CE-extractor-definitions-'));await fs.rm(output,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
