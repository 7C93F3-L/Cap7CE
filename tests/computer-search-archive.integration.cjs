const assert=require("node:assert/strict"),path=require("node:path"),Module=require("node:module"),esbuild=require("esbuild");
const file=path.resolve(__dirname,"../src/renderer/computer-search/computerSearchArchiveConditions.ts");
const compiled=esbuild.buildSync({entryPoints:[file],bundle:true,write:false,platform:"node",format:"cjs",logLevel:"silent"});
const loaded=new Module(file,module);loaded.filename=file;loaded.paths=module.paths;loaded._compile(compiled.outputFiles[0].text,file);
const {toComputerSearchArchiveConditions:map}=loaded.exports;
const {readComputerSearchFacts:read,toCoreSearchFacts:core}=require("../dist-electron/computerSearchFactConditions.js");
const {validMetadataArchiveProperties:valid}=require("../dist-electron/metadataExtraction/metadataArchiveProperties.js");
const base={fileFormat:"all"};assert.deepEqual(map(base),{});
assert.deepEqual(map({...base,archiveEntryCountPreset:"under-10",archiveContentTypes:["image","audio"],archiveStructures:["flat"]}).facts,
  {kind:"archive",archive:{contentTypes:["image","audio"],structures:["flat"],minimumFileCount:0,maximumFileCount:9}});
assert.equal(map({...base,archiveEntryCountPreset:"over-1000"}).facts.archive.minimumFileCount,1000);
assert.deepEqual(map({...base,archiveEntryCountRange:{minCount:0,maxCount:0}}).facts.archive,{minimumFileCount:0,maximumFileCount:0});
for(const bad of [{archiveEntryCountPreset:"constructor"},{archiveEntryCountRange:{minCount:"0"}},{archiveEntryCountRange:{}},
  {archiveEntryCountRange:{minCount:2,maxCount:1}},{archiveStructures:"flat"},{archiveContentTypes:null},{archiveContentTypes:["bad"]}])
  assert.throws(()=>map({...base,...bad}),/invalid-archive/);
assert.throws(()=>map({...base,archiveStructures:["flat"],jsonRootKind:"array"}),/mixed-media/);
const input={kind:"archive",archive:{contentTypes:["image"],maximumFileCount:0}};
const snapshot=read(input);input.archive.contentTypes.push("audio");assert.deepEqual(snapshot.archive.contentTypes,["image"]);
assert.equal(core(snapshot).extractorVersion,2);
for(const bad of [{kind:"archive",minimumWidth:1},{kind:"archive",minimumDurationMilliseconds:0},
  {kind:"text-data",archive:{}},{kind:"archive",archive:{contentTypes:[]}},{kind:"archive",archive:{structures:["bad"]}},
  {kind:"archive",archive:{maximumFileCount:"1"}},{kind:"archive",archive:{maximumFileCount:2000000001}},
  {kind:"archive",archive:{unknown:1}}])assert.throws(()=>read(bad),/invalid-facts/);
assert.equal(valid({listingComplete:true,fileCount:0,hasDirectories:false,contentTypes:[]}),true);
assert.equal(valid({listingComplete:false,hasDirectories:true,contentTypes:[]}),true);
assert.equal(valid({listingComplete:false,contentTypes:["image"]}),true);
for(const bad of [{listingComplete:false,fileCount:0,contentTypes:["image"]},{listingComplete:false,hasDirectories:false,contentTypes:["image"]},
  {listingComplete:false,contentTypes:[]},{listingComplete:true,hasDirectories:false,contentTypes:[]},
  {listingComplete:true,fileCount:0,hasDirectories:false,contentTypes:["image","image"]}])assert.equal(valid(bad),false);
console.log(JSON.stringify({archiveAdapter:"ok",unknownNotZero:true,strictBoundaries:true,ownedSnapshot:true}));
