const assert = require("node:assert/strict");

const {
  getSearchableExtensionsForNaturalKind,
  matchesNaturalSearchCondition,
  planSearchQuery
} = require("../dist-electron/searchQueryPlanner.js");
const { getSearchResultEvidence } = require("../dist-electron/searchEvidenceMatcher.js");

const referenceNow = new Date(2026, 7, 22, 14, 30, 0, 0);
const plan = (query) => planSearchQuery(query, referenceNow);
const firstCondition = (query) => plan(query).terms[0].conditions[0];

assert.ok(getSearchableExtensionsForNaturalKind("image").includes(".png"));
assert.ok(getSearchableExtensionsForNaturalKind("image").includes(".heic"));
assert.equal(getSearchableExtensionsForNaturalKind("image").includes(".svg"), false);
assert.equal(getSearchableExtensionsForNaturalKind("image").includes(".psd"), false);
assert.equal(getSearchableExtensionsForNaturalKind("image").includes(".psb"), false);
assert.equal(getSearchableExtensionsForNaturalKind("image").includes(".pdf"), false);
assert.ok(getSearchableExtensionsForNaturalKind("vector").includes(".ai"));
assert.ok(getSearchableExtensionsForNaturalKind("designSource").includes(".psd"));
assert.ok(getSearchableExtensionsForNaturalKind("document").includes(".pdf"));
assert.ok(getSearchableExtensionsForNaturalKind("document").includes(".txt"));
assert.ok(getSearchableExtensionsForNaturalKind("threeD").includes(".blend"));
assert.deepEqual(getSearchableExtensionsForNaturalKind("wordDocument").sort(), [".doc", ".docx"]);
assert.deepEqual(getSearchableExtensionsForNaturalKind("excelWorkbook").sort(), [".xls", ".xlsx"]);
assert.deepEqual(getSearchableExtensionsForNaturalKind("spreadsheet").sort(), [".et", ".ods", ".xls", ".xlsx"]);
assert.deepEqual(getSearchableExtensionsForNaturalKind("powerpointPresentation").sort(), [".ppt", ".pptx"]);
assert.deepEqual(getSearchableExtensionsForNaturalKind("presentation").sort(), [".dps", ".odp", ".ppt", ".pptx"]);
assert.deepEqual(getSearchableExtensionsForNaturalKind("photoshopSource").sort(), [".psb", ".psd"]);

assert.deepEqual(plan("图片 海报").terms.map((term) => term.term), ["图片", "海报"]);
assert.equal(firstCondition("图片").type, "fileKind");
assert.equal(firstCondition("横图").orientation, "landscape");
assert.equal(firstCondition("横版").orientation, "landscape");
assert.equal(firstCondition("竖版").orientation, "portrait");
assert.deepEqual(firstCondition("1920:1080"), { type: "aspectRatio", width: 16, height: 9 });
assert.equal(plan("前阵子").terms[0].conditions.length, 0);
assert.equal(plan("ai:图片").terms[0].conditions.length, 0);
assert.equal(plan("ps").terms[0].conditions.length, 0);
assert.equal(plan("图").terms[0].conditions.length, 0);
assert.equal(plan("表").terms[0].conditions.length, 0);
assert.equal(plan("灰").terms[0].conditions.length, 0);
assert.equal(plan("照片").terms[0].conditions.length, 0);
assert.equal(plan("正方形").terms[0].conditions.length, 0);
assert.equal(firstCondition("原文件").kind, "designSource");
assert.equal(firstCondition("声音").kind, "audio");
assert.equal(firstCondition("word").kind, "wordDocument");
assert.equal(firstCondition("excel").kind, "excelWorkbook");
assert.equal(firstCondition("表格").kind, "spreadsheet");
assert.equal(firstCondition("powerpoint").kind, "powerpointPresentation");
assert.equal(firstCondition("幻灯片").kind, "presentation");
assert.equal(firstCondition("ps文件").kind, "photoshopSource");
assert.equal(firstCondition("深色").semantic, "dark-image");
assert.equal(firstCondition("粉").semantic, "pink");
assert.equal(firstCondition("动图").type, "animation");
assert.equal(matchesNaturalSearchCondition({ extension: ".gif", isAnimated: true }, firstCondition("动图")), true);
assert.equal(matchesNaturalSearchCondition({ extension: ".gif", isAnimated: false }, firstCondition("动图")), false);

const today = firstCondition("今天");
assert.equal(today.type, "modifiedTime");
assert.equal(new Date(today.startMs).getHours(), 0);
assert.equal(new Date(today.endMs).getDate(), 23);
assert.equal(matchesNaturalSearchCondition({ extension: ".txt", modifiedAt: new Date(2026, 7, 22, 9).toISOString() }, today), true);
assert.equal(matchesNaturalSearchCondition({ extension: ".txt", modifiedAt: new Date(2026, 7, 21, 23, 59).toISOString() }, today), false);
assert.equal(matchesNaturalSearchCondition({ extension: ".txt", modifiedAt: today.endMs }, today), false);
for (const alias of ["今日", "刚刚", "刚才"]) {
  assert.deepEqual(firstCondition(alias), today, alias);
}

const thisWeek = firstCondition("本周");
assert.equal(new Date(thisWeek.startMs).getDay(), 1);
assert.equal(new Date(thisWeek.startMs).getDate(), 17);
const lastMonth = firstCondition("上月");
assert.equal(new Date(lastMonth.startMs).getMonth(), 6);
assert.equal(new Date(lastMonth.endMs).getMonth(), 7);
for (const alias of ["这周", "这星期"]) assert.deepEqual(firstCondition(alias), thisWeek, alias);
for (const alias of ["上星期", "上礼拜"]) assert.deepEqual(firstCondition(alias), firstCondition("上周"), alias);
assert.deepEqual(firstCondition("这个月"), firstCondition("本月"));
assert.deepEqual(firstCondition("上个月"), lastMonth);

const recentThirtyDays = firstCondition("前不久");
assert.equal((recentThirtyDays.endMs - recentThirtyDays.startMs) / 86_400_000, 30);
assert.deepEqual(firstCondition("不久前"), recentThirtyDays);
const recentOneHundredEightyDays = firstCondition("前段时间");
assert.equal((recentOneHundredEightyDays.endMs - recentOneHundredEightyDays.startMs) / 86_400_000, 180);
const longAgo = firstCondition("很久前");
assert.equal(longAgo.startMs, 0);
assert.equal(new Date(longAgo.endMs).getFullYear(), 2025);
assert.deepEqual(firstCondition("很久以前"), longAgo);

const june2026 = firstCondition("2026年6月");
assert.equal(new Date(june2026.startMs).getFullYear(), 2026);
assert.equal(new Date(june2026.startMs).getMonth(), 5);
assert.equal(new Date(june2026.endMs).getMonth(), 6);
const mayFifteenth = firstCondition("2025/5/15");
assert.equal(new Date(mayFifteenth.startMs).getDate(), 15);
assert.equal(new Date(mayFifteenth.endMs).getDate(), 16);
assert.deepEqual(firstCondition("2025-05-15"), mayFifteenth);
assert.equal(new Date(firstCondition("去年5月").startMs).getFullYear(), 2025);
assert.equal(new Date(firstCondition("今年6月").startMs).getFullYear(), 2026);
assert.deepEqual(firstCondition("2025年4月29日"), firstCondition("2025/4/29"));
assert.deepEqual(firstCondition("2025年4月29日"), firstCondition("2025-4-29"));
assert.deepEqual(firstCondition("2025年4月"), firstCondition("2025/4"));
assert.deepEqual(firstCondition("2025年4月"), firstCondition("2025-4"));
for (const invalidDate of ["2026年13月", "今年0月", "2025年2月29日", "2025/2/29", "2025-04-31", "2025/13", "2025-0", "2025/5-15"]) {
  assert.equal(plan(invalidDate).terms[0].conditions.length, 0, invalidDate);
}

assert.equal(matchesNaturalSearchCondition({ extension: ".png", imageWidth: 1600, imageHeight: 900 }, firstCondition("横图")), true);
assert.equal(matchesNaturalSearchCondition({ extension: ".png", imageWidth: 900, imageHeight: 1600 }, firstCondition("竖图")), true);
assert.equal(matchesNaturalSearchCondition({ extension: ".png", imageWidth: 1000, imageHeight: 1000 }, firstCondition("方图")), true);
assert.equal(matchesNaturalSearchCondition({ extension: ".png", imageWidth: 1920, imageHeight: 1080 }, firstCondition("16:9")), true);
assert.equal(matchesNaturalSearchCondition({ extension: ".png", imageWidth: 0, imageHeight: 0 }, firstCondition("16:9")), false);

const baseCandidate = {
  filePath: "C:\\素材\\海报\\普通文件.txt",
  fileName: "普通文件.txt",
  extension: ".txt",
  directoryPath: "C:\\素材",
  directoryName: "素材",
  keywords: [],
  userDescription: "",
  aiKeywords: [],
  caption: "",
  modifiedAt: new Date(2026, 7, 20, 12).toISOString(),
  imageWidth: 0,
  imageHeight: 0
};
const categoryEvidence = getSearchResultEvidence({ ...baseCandidate, extension: ".png" }, "图片", plan("图片"));
assert.equal(categoryEvidence.terms[0].bestSource, "fileCategory");
assert.equal(categoryEvidence.classification, "naturalCondition");

const ordinaryFallback = getSearchResultEvidence({ ...baseCandidate, fileName: "图片说明.txt" }, "图片", plan("图片"));
assert.equal(ordinaryFallback.terms[0].bestSource, "fileName");
assert.equal(ordinaryFallback.terms[0].sources.includes("fileCategory"), false);

const mixedEvidence = getSearchResultEvidence(
  { ...baseCandidate, fileName: "项目海报.png", extension: ".png" },
  "图片 海报",
  plan("图片 海报")
);
assert.deepEqual(mixedEvidence.terms.map((term) => term.bestSource), ["fileCategory", "fileName"]);
assert.equal(getSearchResultEvidence({ ...baseCandidate, extension: ".png" }, "图片 人物", plan("图片 人物")), null);

console.log(JSON.stringify({
  centralFileKindsVerified: true,
  fixedLocalTimeRangesVerified: true,
  orientationAndRatioVerified: true,
  ordinaryTextOrNaturalConditionVerified: true,
  multiTermAndVerified: true
}));
