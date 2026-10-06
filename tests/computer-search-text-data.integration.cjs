const assert=require("node:assert/strict");
const path=require("node:path"),Module=require("node:module"),esbuild=require("esbuild");
const file=path.resolve(__dirname,"../src/renderer/computer-search/computerSearchTextDataConditions.ts");
const compiled=esbuild.buildSync({entryPoints:[file],bundle:true,write:false,platform:"node",format:"cjs",logLevel:"silent"});
const loaded=new Module(file,module);loaded.filename=file;loaded.paths=module.paths;loaded._compile(compiled.outputFiles[0].text,file);
const {toComputerSearchTextDataConditions:map}=loaded.exports;
const {readComputerSearchFacts:read,toCoreSearchFacts:core}=require("../dist-electron/computerSearchFactConditions.js");
const {validMetadataTextDataProperties:valid}=require("../dist-electron/metadataExtraction/metadataTextDataProperties.js");
const base={fileFormat:"all"};
assert.deepEqual(map(base),{});
assert.deepEqual(map({...base,textCharacterCountPreset:"over-100000",textLineCountPreset:"up-to-10"}).facts,
  {kind:"text-data",textData:{factKind:"text",minimumCharacterCount:100001,minimumLineCount:0,maximumLineCount:10}});
assert.deepEqual(map({...base,csvRecordCountRange:{minCount:0,maxCount:0},csvColumnCountPreset:"2-5"}).facts,
  {kind:"text-data",textData:{factKind:"csv",minimumRecordCount:0,maximumRecordCount:0,minimumColumnCount:2,maximumColumnCount:5}});
assert.deepEqual(map({...base,jsonItemCountPreset:"11-100",jsonRootKind:"array"}).facts,
  {kind:"text-data",textData:{factKind:"json",minimumRecordCount:11,maximumRecordCount:100,jsonRootKind:"array"}});
for(const bad of [{textCharacterCountRange:{minCount:"0"}},{textLineCountRange:{}},{csvColumnCountRange:{minCount:2,maxCount:1}},
  {csvRecordCountPreset:"constructor"},{jsonItemCountRange:{maxCount:1000000001}},{jsonRootKind:["array"]}])
  assert.throws(()=>map({...base,...bad}),/invalid-text-data/);
assert.throws(()=>map({...base,textLineCountPreset:"up-to-10",jsonRootKind:"array"}),/mixed-media/);
assert.throws(()=>map({...base,jsonRootKind:"array",threeDStructures:["static"]}),/mixed-media/);
const input={kind:"text-data",textData:{factKind:"json",maximumRecordCount:0,jsonRootKind:"array"}};
const snapshot=read(input);input.textData.maximumRecordCount=100;
assert.equal(snapshot.textData.maximumRecordCount,0,"validated nested conditions own a snapshot");
assert.equal(core(snapshot).extractorVersion,2);
assert.deepEqual(core(snapshot).textData,snapshot.textData);
for(const bad of [{kind:"text-data",minimumWidth:1},{kind:"text-data",minimumDurationMilliseconds:0},
  {kind:"font",textData:{factKind:"text"}},{kind:"text-data",textData:{factKind:"json",minimumLineCount:0}},
  {kind:"text-data",textData:{factKind:"csv",jsonRootKind:"array"}},{kind:"text-data",textData:{factKind:"text",maximumCharacterCount:"1"}},
  {kind:"text-data",textData:{factKind:"unknown"}}]) assert.throws(()=>read(bad),/invalid-facts/);
assert.equal(valid({factKind:"text",characterCount:0,lineCount:0}),true);
assert.equal(valid({factKind:"csv",recordCount:0,columnCount:0}),true);
assert.equal(valid({factKind:"json",recordCount:0,jsonRootKind:"array"}),true);
for(const vector of [{factKind:"json",recordCount:0,jsonRootKind:["array"]},{factKind:"csv",recordCount:1,columnCount:1,characterCount:0},
  {factKind:"text",characterCount:0},{factKind:"text",characterCount:9007199254740992,lineCount:1}]) assert.equal(valid(vector),false);
console.log(JSON.stringify({textDataConditions:"ok",exactPresetBoundaries:true,knownZero:true,strictSubkind:true,noClientExtractorVersion:true,unknownFieldsRejected:true}));
