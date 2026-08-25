const assert = require("node:assert/strict");
const { getVisualPropertySemanticCondition, matchesVisualPropertyCondition } = require("../dist-electron/visualPropertySemantics.js");
const { planSearchQuery } = require("../dist-electron/searchQueryPlanner.js");
const { getSearchResultEvidence } = require("../dist-electron/searchEvidenceMatcher.js");

const emptyColors = { red: 0, orange: 0, yellow: 0, green: 0, cyan: 0, blue: 0, purple: 0, pink: 0 };
const properties = (overrides = {}) => ({
  transparentRatio: 0, semitransparentRatio: 0, borderTransparentRatio: 0,
  brightnessMean: 5000, brightnessMedian: 5000, darkRatio: 0, highlightRatio: 0,
  saturationMean: 5000, highSaturationRatio: 0, lowSaturationRatio: 0,
  borderWhiteRatio: 0, borderBlackRatio: 0, borderUniformity: 5000,
  colorRatios: { ...emptyColors }, colorBlockRatios: { ...emptyColors },
  ...overrides
});

const transparent = getVisualPropertySemanticCondition("无背景");
assert.equal(transparent.strength, "strong");
assert.equal(matchesVisualPropertyCondition(properties({ borderTransparentRatio: 5001 }), transparent), true);
assert.equal(matchesVisualPropertyCondition(properties({ borderTransparentRatio: 5000 }), transparent), false);
for (const alias of ["透明", "透明背景", "透明底", "无背景"]) {
  assert.equal(getVisualPropertySemanticCondition(alias).semantic, "transparent-background");
}

const white = getVisualPropertySemanticCondition("白底");
assert.equal(matchesVisualPropertyCondition(properties({ borderWhiteRatio: 8001 }), white), true);
assert.equal(matchesVisualPropertyCondition(properties({ transparentRatio: 501, borderWhiteRatio: 9000 }), white), false);
const dark = getVisualPropertySemanticCondition("暗图");
assert.equal(matchesVisualPropertyCondition(properties({ darkRatio: 7001 }), dark), true);
assert.equal(getVisualPropertySemanticCondition("深色").semantic, "dark-image");
assert.equal(getVisualPropertySemanticCondition("暗"), null, "single-character dark must remain ordinary text");
const red = getVisualPropertySemanticCondition("红色");
assert.equal(red.strength, "soft");
assert.equal(matchesVisualPropertyCondition(properties({
  colorRatios: { ...emptyColors, red: 1501 },
  colorBlockRatios: { ...emptyColors, red: 501 }
}), red), true);
const orange = getVisualPropertySemanticCondition("橙色");
assert.equal(orange.strength, "soft");
assert.equal(matchesVisualPropertyCondition(properties({
  colorRatios: { ...emptyColors, orange: 1501 },
  colorBlockRatios: { ...emptyColors, orange: 501 }
}), orange), true);
assert.equal(matchesVisualPropertyCondition(properties({
  colorRatios: { ...emptyColors, orange: 1500 },
  colorBlockRatios: { ...emptyColors, orange: 900 }
}), orange), false);
assert.equal(getVisualPropertySemanticCondition("暖色"), null, "warm color needs an independent multi-family definition");
assert.equal(getVisualPropertySemanticCondition("粉").semantic, "pink");
const gray = getVisualPropertySemanticCondition("灰色");
assert.equal(gray.semantic, "gray-tone");
assert.equal(gray.strength, "soft");
assert.equal(getVisualPropertySemanticCondition("灰色调").semantic, "gray-tone");
assert.equal(getVisualPropertySemanticCondition("灰"), null, "single-character gray must remain ordinary text");
const grayProperties = properties({
  saturationMean: 999,
  lowSaturationRatio: 8001,
  brightnessMean: 5000,
  brightnessMedian: 5000
});
assert.equal(matchesVisualPropertyCondition(grayProperties, gray), true);
assert.equal(matchesVisualPropertyCondition({ ...grayProperties, saturationMean: 1000 }, gray), false);
assert.equal(matchesVisualPropertyCondition({ ...grayProperties, lowSaturationRatio: 8000 }, gray), false);
assert.equal(matchesVisualPropertyCondition({ ...grayProperties, borderWhiteRatio: 8001 }, gray), false);
assert.equal(matchesVisualPropertyCondition({ ...grayProperties, borderBlackRatio: 8001 }, gray), false);
assert.equal(matchesVisualPropertyCondition({ ...grayProperties, brightnessMean: 1200 }, gray), false);
assert.equal(matchesVisualPropertyCondition({ ...grayProperties, brightnessMedian: 8201 }, gray), false);

assert.equal(planSearchQuery("夜晚").terms[0].conditions.length, 0);
assert.equal(planSearchQuery("极简").terms[0].conditions.length, 0);
assert.equal(planSearchQuery("红色短袖").terms[0].conditions.length, 0);
assert.equal(planSearchQuery("透明 红色").terms.every((term) => term.conditions[0].type === "visualProperty"), true);

const baseCandidate = {
  filePath: "C:\\素材\\普通.png", fileName: "普通.png", extension: ".png",
  directoryPath: "C:\\素材", directoryName: "素材", keywords: [], userDescription: "",
  aiKeywords: [], caption: "", imageWidth: 100, imageHeight: 100
};
const combinedProperties = properties({
  borderTransparentRatio: 6000,
  colorRatios: { ...emptyColors, red: 2000 },
  colorBlockRatios: { ...emptyColors, red: 600 }
});
const transparentEvidence = getSearchResultEvidence(
  { ...baseCandidate, visualProperties: combinedProperties }, "透明"
);
assert.equal(transparentEvidence.weakestSource, "visualPropertyStrong");
assert.equal(transparentEvidence.classification, "naturalCondition");
const redEvidence = getSearchResultEvidence({ ...baseCandidate, visualProperties: combinedProperties }, "红色");
assert.equal(redEvidence.weakestSource, "visualPropertySoft");
assert.equal(redEvidence.classification, "visualSimilarity");
const mixedEvidence = getSearchResultEvidence({ ...baseCandidate, visualProperties: combinedProperties }, "透明 红色");
assert.equal(mixedEvidence.classification, "visualSimilarity");
const grayEvidence = getSearchResultEvidence({ ...baseCandidate, visualProperties: grayProperties }, "灰色调");
assert.equal(grayEvidence.weakestSource, "visualPropertySoft");
assert.equal(grayEvidence.classification, "visualSimilarity");
const baseFallback = getSearchResultEvidence({ ...baseCandidate, fileName: "红色说明.png" }, "红色");
assert.equal(baseFallback.classification, "fileName", "missing visual properties must not remove ordinary evidence");

console.log(JSON.stringify({
  aliasesRemainIndependentFromStoredFacts: true,
  strongTransparentBoundaryVerified: true,
  softBackgroundDarkAndColorBoundariesVerified: true,
  grayToneProbeBoundariesVerified: true,
  semanticOverreachExcluded: true,
  missingPropertyFallbackVerified: true
}));
