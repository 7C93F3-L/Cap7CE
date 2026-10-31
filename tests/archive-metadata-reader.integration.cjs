const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),os=require("node:os");
const {boundWasmMemory}=require("./support/load-canonical.cjs")("core/node/fileFacts/domain/boundedWasmMemory.ts");
const {restrictArchiveSourceFilesystem}=require("./support/load-canonical.cjs")("core/node/fileFacts/domain/archiveSourceFilesystem.ts");
const {readArchiveMetadata}=require("./support/load-canonical.cjs")("core/node/fileFacts/domain/archiveMetadataReader.ts");
const {parseArchiveListOutput}=require("./support/load-canonical.cjs")("core/node/fileFacts/domain/archivePreviewList.ts");
const {deriveArchiveFact}=require("./support/load-canonical.cjs")("core/node/fileFacts/domain/archiveFactExtractor.ts");
const {zipSync,strToU8}=require("fflate");

(async()=>{
  const fixture=Uint8Array.from([0,97,115,109,1,0,0,0,5,4,1,1,1,3,7,10,1,6,...Buffer.from("memory"),2,0]);
  const before=fixture.slice(),bounded=boundWasmMemory(fixture,2*65536);
  const instance=await WebAssembly.instantiate(bounded);
  assert.equal(instance.instance.exports.memory.grow(1),1);
  assert.throws(()=>instance.instance.exports.memory.grow(1),RangeError,"WASM linear memory cannot exceed its declared budget");
  assert.deepEqual(fixture,before,"dependency input bytes cannot be changed in place");
  const smaller=fixture.slice();smaller[13]=1;
  const alreadyBounded=await WebAssembly.instantiate(boundWasmMemory(smaller,2*65536));
  assert.throws(()=>alreadyBounded.instance.exports.memory.grow(1),RangeError,"an existing smaller maximum is never widened");
  for(const bytes of [fixture.subarray(0,10),Uint8Array.from([0,97,115,109,1,0,0,0]),
    Uint8Array.from([0,97,115,109,1,0,0,0,5,4,1,3,1,3])]) assert.throws(()=>boundWasmMemory(bytes,2*65536),/memory-contract/);
  assert.throws(()=>boundWasmMemory(fixture,65535),/memory-contract/);
  let writes=0,opens=0;
  class Denied extends Error {}
  const mock={FS:{ErrnoError:Denied},NODEFS:{node_ops:{lookup:(_parent,name)=>name,setattr:()=>writes++},
    stream_ops:{open:()=>opens++,write:()=>writes++},realPath:node=>node.path}};
  const source=path.join(os.tmpdir(),"archive-source.zip");restrictArchiveSourceFilesystem(mock,source);
  assert.equal(mock.NODEFS.node_ops.lookup({},"archive-source.zip"),"archive-source.zip");
  assert.throws(()=>mock.NODEFS.node_ops.lookup({},"archive-source.part2.rar"),Denied);
  mock.NODEFS.stream_ops.open({node:{path:source},flags:0});
  assert.throws(()=>mock.NODEFS.stream_ops.open({node:{path:source},flags:2}),Denied);
  assert.throws(()=>mock.NODEFS.stream_ops.open({node:{path:path.join(os.tmpdir(),"other.zip")},flags:0}),Denied);
  assert.throws(()=>mock.NODEFS.stream_ops.write({}),Denied);assert.throws(()=>mock.NODEFS.node_ops.setattr({}),Denied);
  assert.equal(opens,1);assert.equal(writes,0,"source mount cannot write or open adjacent volumes");
  const skipped=parseArchiveListOutput('Path = '+"a".repeat(4097)+'\nSize = 1\n\nPath = image.jpg\nSize = 1');
  const incomplete=deriveArchiveFact(skipped);assert.equal(incomplete.fileCountKnown,false);
  assert.equal(incomplete.structureKnown,false);assert.deepEqual(incomplete.contentTypes,["image"]);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"cap7ce-archive-metadata-"));
  try {
    const archive=path.join(root,"只读归档.zip"),empty=path.join(root,"empty.zip"),many=path.join(root,"many.zip");
    const sourceBytes=Buffer.from(zipSync({"image.jpg":strToU8("image"),"nested/readme.txt":strToU8("text")}));
    await fs.writeFile(archive,sourceBytes);await fs.writeFile(empty,zipSync({}));
    const signal=new AbortController().signal;
    const metadata=await readArchiveMetadata(archive,signal);
    assert.equal(metadata.listingComplete,true);assert.equal(metadata.fileCount,2);assert.equal(metadata.hasDirectories,true);
    assert.deepEqual(new Set(metadata.contentTypes),new Set(["image","document"]));
    assert.deepEqual(await fs.readFile(archive),sourceBytes,"listing cannot change or extract source entries");
    const emptyMetadata=await readArchiveMetadata(empty,signal);
    assert.deepEqual(emptyMetadata,{listingComplete:true,fileCount:0,hasDirectories:false,contentTypes:[]});
    await fs.writeFile(many,zipSync(Object.fromEntries(Array.from({length:40},(_,i)=>[`nested/file-${i}.txt`,strToU8("data")]))));
    const partial=await readArchiveMetadata(many,signal,1024);
    assert.equal(partial.listingComplete,false);assert.equal(partial.fileCount,undefined);
    assert.equal(partial.hasDirectories,true);assert.deepEqual(partial.contentTypes,["document"]);
    const aborted=new AbortController();aborted.abort();await assert.rejects(readArchiveMetadata(archive,aborted.signal));
    assert.deepEqual((await fs.readdir(root)).sort(),["empty.zip","many.zip","只读归档.zip"].sort(),"no archive entry may be extracted");
    console.log(JSON.stringify({archiveMetadataReader:"ok",wasmMemoryBounded:true,readOnlySingleFile:true,partialCountUnknown:true,knownEmpty:true,noExtraction:true}));
  } finally {await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
