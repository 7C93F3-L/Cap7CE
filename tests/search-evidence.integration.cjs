const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");

const { getSearchResultEvidence, getSearchTermEvidenceSources } = require("../dist-electron/searchEvidenceMatcher.js");
const { compareSearchEvidence } = require("../dist-electron/searchRankingPolicy.js");
const { SEARCH_EVIDENCE_SOURCE_RANK } = require("../dist-electron/searchEvidenceTypes.js");

assert.ok(SEARCH_EVIDENCE_SOURCE_RANK.visualPropertySoft < SEARCH_EVIDENCE_SOURCE_RANK.aiKeyword);

const candidate = {
  filePath: "C:\\素材根目录\\海报\\夏季活动\\黑色短袖.png",
  fileName: "黑色短袖.png",
  extension: ".png",
  directoryPath: "C:\\素材根目录",
  directoryName: "客户展示名",
  keywords: ["人工词", "重复证据"],
  userDescription: "人工说明中的室外人物",
  aiKeywords: ["牛仔裤", "重复证据"],
  caption: "一名女性站在城市背景中",
  embeddedEvidence: [{
    kind: "visual_content",
    searchText: `${"前置内容 ".repeat(20)}米黄色上衣 长发女性 哥特式建筑 台阶 ${"后置内容 ".repeat(30)}`
  }]
};

assert.deepEqual(getSearchTermEvidenceSources(candidate, "人工词"), ["userKeyword"]);
assert.deepEqual(getSearchTermEvidenceSources(candidate, "室外"), ["userDescription"]);
assert.deepEqual(getSearchTermEvidenceSources(candidate, "黑色短袖"), ["fileName"]);
assert.deepEqual(getSearchTermEvidenceSources(candidate, "png"), ["fileExtension"]);
assert.deepEqual(getSearchTermEvidenceSources(candidate, ".png"), ["fileExtension"]);
assert.deepEqual(getSearchTermEvidenceSources(candidate, "夏季活动"), ["relativeDirectory"]);
assert.deepEqual(getSearchTermEvidenceSources(candidate, "素材根目录"), ["rootDirectoryName"]);
assert.deepEqual(getSearchTermEvidenceSources(candidate, "客户展示"), ["directoryDisplayName"]);
assert.deepEqual(getSearchTermEvidenceSources(candidate, "牛仔裤"), ["aiKeyword"]);
assert.deepEqual(getSearchTermEvidenceSources(candidate, "女性"), ["embeddedMetadata", "aiCaption"]);
assert.deepEqual(getSearchTermEvidenceSources(candidate, "哥特式"), ["embeddedMetadata"]);
assert.deepEqual(getSearchTermEvidenceSources(candidate, "重复证据"), ["userKeyword", "aiKeyword"]);
assert.deepEqual(getSearchTermEvidenceSources({ ...candidate, fileName: "literal_%_\\.txt", extension: ".txt" }, "%_\\"), ["fileName"]);

const multiTermEvidence = getSearchResultEvidence(candidate, "人工词 黑色短袖 牛仔裤");
assert.ok(multiTermEvidence);
assert.deepEqual(multiTermEvidence.terms.map((term) => term.bestSource), ["userKeyword", "fileName", "aiKeyword"]);
assert.equal(multiTermEvidence.weakestSource, "aiKeyword");
assert.equal(multiTermEvidence.classification, "aiMetadata");
assert.equal(getSearchResultEvidence(candidate, "人工词 不存在"), null);
assert.equal(getSearchResultEvidence(candidate, "   "), null);
const embeddedEvidence = getSearchResultEvidence(candidate, "米黄色 哥特式");
assert.equal(embeddedEvidence.classification, "embeddedMetadata");
assert.deepEqual(embeddedEvidence.terms.map((term) => term.bestSource), ["embeddedMetadata", "embeddedMetadata"]);
assert.equal(embeddedEvidence.embeddedMatches.length, 2);
assert.ok(embeddedEvidence.embeddedMatches.every((match) => match.snippet.length <= 180));
assert.ok(embeddedEvidence.embeddedMatches.every((match) => match.snippet.length < candidate.embeddedEvidence[0].searchText.length));

const userAndPath = getSearchResultEvidence(candidate, "人工词 夏季活动");
const fileAndPath = getSearchResultEvidence(candidate, "黑色短袖 夏季活动");
assert.ok(userAndPath && fileAndPath);
assert.equal(compareSearchEvidence(userAndPath, fileAndPath, "weakest-required"), 0);
assert.ok(compareSearchEvidence(userAndPath, fileAndPath, "evidence-vector") < 0);

const bulkStartedAt = performance.now();
for (let index = 0; index < 5000; index += 1) {
  const evidence = getSearchResultEvidence({
    ...candidate,
    filePath: `C:\\素材根目录\\海报\\批次-${index}\\黑色短袖-${index}.png`,
    fileName: `黑色短袖-${index}.png`
  }, "人工词 黑色短袖 海报 牛仔裤");
  assert.ok(evidence);
}
const bulkMilliseconds = performance.now() - bulkStartedAt;
assert.ok(bulkMilliseconds < 1500, `5000-item evidence ranking took ${bulkMilliseconds.toFixed(1)} ms`);

console.log(JSON.stringify({
  granularSourcesVerified: 16,
  multipleSourcesPreserved: true,
  multiTermWeakestClassificationVerified: true,
  literalSpecialCharactersVerified: true,
  weakestAndVectorStrategiesCompared: true,
  bulkCandidates: 5000,
  bulkMilliseconds: Number(bulkMilliseconds.toFixed(1))
}));
