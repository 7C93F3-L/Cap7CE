const assert = require("node:assert/strict");
const { readComputerSearchFacts, toCoreSearchFacts } = require("../dist-electron/computerSearchFactConditions.js");
assert.equal(readComputerSearchFacts(undefined), undefined);
for (const value of [null, [], {}, { kind: "color" }, { kind: "video", extractorVersion: 100 },
  { kind: "image-dimensions", minimumDurationMilliseconds: 0 }, { kind: "video", minimumWidth: 1.5 },
  { kind: "video", maximumWidth: 2147483648 }, { kind: "video", minimumDurationMilliseconds: Number.MAX_SAFE_INTEGER + 1 },
  { kind: "video", minimumHeight: 50, maximumHeight: 49 }, { kind: "video", minimumDurationMilliseconds: 10, maximumDurationMilliseconds: 9 },
  { kind: "video", minimumAspectRatio: { numerator: 1, denominator: 0 } },
  { kind: "video", minimumAspectRatio: { numerator: 2, denominator: 1 }, maximumAspectRatio: { numerator: 1, denominator: 1 } }]) {
  assert.throws(() => readComputerSearchFacts(value), /invalid-facts/);
}
const input = { kind: "image-dimensions", minimumWidth: 100, maximumWidth: 200,
  minimumAspectRatio: { numerator: 4, denominator: 3 }, maximumAspectRatio: { numerator: 16, denominator: 9 } };
const output = readComputerSearchFacts(input); input.minimumAspectRatio.numerator = 900;
assert.equal(output.minimumAspectRatio.numerator, 4, "validated conditions own their scalar snapshot");
assert.equal(toCoreSearchFacts(output).extractorVersion, require("../dist-electron/metadataExtraction/imageMetadataMetrics.js").CORE_IMAGE_METADATA_EXTRACTOR_VERSION);
assert.equal(readComputerSearchFacts({ kind: "video", minimumDurationMilliseconds: 0 }).minimumDurationMilliseconds, 0);
console.log("Core fact conditions reject unsafe ranges and client-controlled extractor versions.");
const groups = [{ alternatives: [[{ metric: "colorRatio.red", operator: ">", value: 1500 }], [{ metric: "colorRatio.blue", operator: ">", value: 1500 }]] }];
const imageProperties = readComputerSearchFacts({ kind: "image-dimensions", isAnimated: false, visualGroups: groups });
const videoProperties = readComputerSearchFacts({ kind: "video", maximumDurationMilliseconds: 3000, visualGroups: groups });
assert.equal(toCoreSearchFacts(videoProperties).extractorVersion,2);
groups[0].alternatives[0][0].value = 9000;
assert.equal(imageProperties.visualGroups[0].alternatives[0][0].value, 1500, "image predicates own a deep snapshot");
for (const facts of [{ kind: "video", isAnimated: false }, { kind: "image-dimensions", isAnimated: null },
  { kind: "image-dimensions", visualGroups: [] }, { kind: "image-dimensions", visualGroups: [{ alternatives: [] }] },
  ...[{ metric: "unknown", operator: ">", value: 0 }, { metric: "brightnessMean", operator: [">"], value: 0 },
    { metric: "brightnessMean", operator: ">", value: 10001 }, { metric: "brightnessMean", operator: ">", value: 1.5 }]
    .map(constraint => ({ kind: "image-dimensions", visualGroups: [{ alternatives: [[constraint]] }] }))])
  assert.throws(() => readComputerSearchFacts(facts), /invalid-facts/);
const { readComputerSearchFileConditions } = require("../dist-electron/computerSearchFileConditions.js");
const exactTime = "133000000000000003";
assert.deepEqual(readComputerSearchFileConditions({ minimumModifiedFileTime: exactTime }), { minimumModifiedFileTime: exactTime });
for (const value of [null, [], { extensions: [".png", ".PNG"] }, { extensions: ["../png"] },
  { minimumSizeBytes: 3, maximumSizeBytes: 2 }, { minimumSizeBytes: 1.5 }, { maximumSizeBytes: Number.MAX_SAFE_INTEGER + 1 },
  { minimumModifiedFileTime: Number(exactTime) }, { minimumModifiedFileTime: "-1" }, { maximumModifiedFileTime: "9223372036854775808" },
  { minimumModifiedFileTime: "10", maximumModifiedFileTime: "9" }, { unknown: 1 }]) {
  assert.throws(() => readComputerSearchFileConditions(value), /invalid-file-conditions/);
}
for(const value of [{excludedExtensions:[".png",".PNG"]},{excludedExtensions:[""]},{excludedExtensions:["../foo"]},{excludedExtensions:Array(129).fill(".png")},{excludedExtensions:".png"}]) assert.throws(()=>readComputerSearchFileConditions(value),/invalid-file-conditions/);
const excludedInput={excludedExtensions:[".PNG",".mp4"]},excludedOutput=readComputerSearchFileConditions(excludedInput);excludedInput.excludedExtensions.length=0;assert.deepEqual(excludedOutput.excludedExtensions,[".PNG",".mp4"]);
const extensionInput = { extensions: [".PNG", ".mp4"], minimumSizeBytes: 0 };
const extensionOutput = readComputerSearchFileConditions(extensionInput); extensionInput.extensions.length = 0;
assert.deepEqual(extensionOutput.extensions, [".PNG", ".mp4"]);
assert.deepEqual(readComputerSearchFileConditions({extensions:[]}),{extensions:[]},"explicit empty intersection cannot broaden to all types");
console.log("Base file conditions preserve exact FILETIME and validate bounded format, size and time ranges.");
for (const ranges of [[], [{}], [{minimum:{numerator:1,denominator:1},maximum:{numerator:1,denominator:1},minimumInclusive:false}],
  [{minimum:{numerator:1,denominator:1},minimumInclusive:'yes'}], [{maximum:{numerator:10_000_001,denominator:1}}],
  Array.from({length:41},()=>({maximum:{numerator:1,denominator:2}}))]) {
  assert.throws(()=>readComputerSearchFacts({kind:'image-dimensions',aspectRanges:ranges}),/invalid-facts/);
}
const union = [{maximum:{numerator:1,denominator:2}},{minimum:{numerator:2,denominator:1},minimumInclusive:false}];
assert.deepEqual(readComputerSearchFacts({kind:'video',aspectRanges:union}).aspectRanges,union);
console.log("Aspect unions keep disjoint intervals and exclusive boundaries across validation.");
for(const ranges of [[],[{}],[{minimum:0}],[{minimum:10,maximum:9}],[{maximum:2147483648}],Array.from({length:17},()=>({minimum:1}))]){
  assert.throws(()=>readComputerSearchFacts({kind:'video',shortEdgeRanges:ranges}),/invalid-facts/);
}
assert.deepEqual(readComputerSearchFacts({kind:'video',shortEdgeRanges:[{minimum:720,maximum:1079},{minimum:2160}]}).shortEdgeRanges,
  [{minimum:720,maximum:1079},{minimum:2160}]);
