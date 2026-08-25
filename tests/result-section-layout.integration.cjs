const assert = require("node:assert/strict");
const {
  buildResultGridLayoutItems,
  getNavigatedResultFileIndex,
  getResultLayoutIndexForFileIndex
} = require("../src/renderer/results/resultSectionLayout.ts");

const createImage = (id, classification) => ({
  id,
  searchEvidence: classification ? {
    terms: [{ term: id, sources: ["fileName"], bestSource: "fileName" }],
    classification,
    weakestSource: "fileName",
    policy: "weakest-required-vector-v1",
    embeddedMatches: []
  } : null
});

assert.deepEqual(buildResultGridLayoutItems([]), []);
assert.deepEqual(buildResultGridLayoutItems([], true), [
  { kind: "section", key: "section:aiDeepMatch:status", section: "aiDeepMatch" }
]);

const emptyQueryImages = [createImage("empty-1", null), createImage("empty-2", null)];
const emptyQueryLayout = buildResultGridLayoutItems(emptyQueryImages);
assert.equal(emptyQueryLayout.length, 2);
assert.ok(emptyQueryLayout.every((item) => item.kind === "file"));

const singleSectionLayout = buildResultGridLayoutItems([
  createImage("single-1", "fileName"),
  createImage("single-2", "fileName")
]);
assert.deepEqual(singleSectionLayout.map((item) => item.kind), ["section", "file", "file"]);
assert.equal(
  buildResultGridLayoutItems([createImage("embedded-1", "embeddedMetadata")])[0].section,
  "fastMatch"
);
assert.equal(
  buildResultGridLayoutItems([createImage("visual-1", "visualSimilarity")])[0].section,
  "possibleSimilarity"
);

for (const classification of ["userMetadata", "fileName", "fileFormat", "naturalCondition", "directoryPath", "embeddedMetadata"]) {
  assert.equal(buildResultGridLayoutItems([createImage(classification, classification)])[0].section, "fastMatch");
}
for (const classification of ["aiMetadata", "visualSimilarity"]) {
  assert.equal(buildResultGridLayoutItems([createImage(classification, classification)])[0].section, "possibleSimilarity");
}
assert.equal(buildResultGridLayoutItems([createImage("ai-search", "aiDeepMatch")])[0].section, "aiDeepMatch");
assert.equal(
  buildResultGridLayoutItems([createImage("name-only", "fileName")], true).filter((item) => item.kind === "section" && item.section === "aiDeepMatch").length,
  1
);
assert.equal(
  buildResultGridLayoutItems([createImage("ai-search-once", "aiDeepMatch")], true).filter((item) => item.kind === "section" && item.section === "aiDeepMatch").length,
  1
);

const images = [
  createImage("user-1", "userMetadata"),
  createImage("user-2", "userMetadata"),
  createImage("name-1", "fileName"),
  createImage("path-1", "directoryPath"),
  createImage("path-2", "directoryPath"),
  createImage("ai-1", "aiMetadata")
];
const layout = buildResultGridLayoutItems(images);
assert.equal(layout.filter((item) => item.kind === "section").length, 2);
assert.deepEqual(
  layout.filter((item) => item.kind === "file").map((item) => item.fileIndex),
  [0, 1, 2, 3, 4, 5]
);
assert.equal(getResultLayoutIndexForFileIndex(layout, 2), 3);
assert.equal(getNavigatedResultFileIndex(layout, 1, "right", 3), 2);
assert.equal(getNavigatedResultFileIndex(layout, 2, "left", 3), 1);
assert.equal(getNavigatedResultFileIndex(layout, 0, "down", 3), 3);
assert.equal(getNavigatedResultFileIndex(layout, 2, "up", 3), 2);
assert.equal(getNavigatedResultFileIndex(layout, 1, "down", 3), 4);
assert.equal(getNavigatedResultFileIndex(layout, 5, "right", 3), 5);

const largeImages = Array.from({ length: 5000 }, (_, index) => createImage(`large-${index}`, "fileName"));
const largeLayout = buildResultGridLayoutItems(largeImages);
assert.equal(largeLayout.length, 5001);
assert.equal(largeLayout.filter((item) => item.kind === "file").length, 5000);

console.log(JSON.stringify({
  emptyQueryHasNoSections: true,
  singleAndMultipleSectionsVerified: true,
  fileIndexesRemainPureAndContiguous: true,
  keyboardNavigationSkipsSections: true,
  largeResultLayoutVerified: 5000
}));
