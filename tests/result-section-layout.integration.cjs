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
// No historical classification may recreate an old result or empty AI status card.
for (const classification of [null, "userMetadata", "fileName", "fileFormat", "naturalCondition", "directoryPath", "embeddedMetadata", "aiMetadata", "visualSimilarity", "aiDeepMatch"]) {
  const items = [createImage("first", classification), createImage("second", classification)];
  const result = buildResultGridLayoutItems(items);
  assert.deepEqual(result.map(value => value.kind), ["file", "file"]);
  assert.deepEqual(result.map(value => value.item), items);
  assert.equal(result[0].item.searchEvidence, items[0].searchEvidence, "evidence remains available without heading tiles");
}

const images = [
  createImage("user-1", "userMetadata"),
  createImage("user-2", "userMetadata"),
  createImage("name-1", "fileName"),
  createImage("path-1", "directoryPath"),
  createImage("path-2", "directoryPath"),
  createImage("ai-1", "aiMetadata")
];
const layout = buildResultGridLayoutItems(images);
assert.equal(layout.length, images.length);
assert.deepEqual(
  layout.filter((item) => item.kind === "file").map((item) => item.fileIndex),
  [0, 1, 2, 3, 4, 5]
);
assert.equal(getResultLayoutIndexForFileIndex(layout, 2), 2);
assert.equal(getNavigatedResultFileIndex(layout, 1, "right", 3), 2);
assert.equal(getNavigatedResultFileIndex(layout, 2, "left", 3), 1);
assert.equal(getNavigatedResultFileIndex(layout, 0, "down", 3), 3);
assert.equal(getNavigatedResultFileIndex(layout, 2, "up", 3), 2);
assert.equal(getNavigatedResultFileIndex(layout, 1, "down", 3), 4);
assert.equal(getNavigatedResultFileIndex(layout, 5, "right", 3), 5);

const largeImages = Array.from({ length: 5000 }, (_, index) => createImage(`large-${index}`, "fileName"));
const largeLayout = buildResultGridLayoutItems(largeImages);
assert.equal(largeLayout.length, 5000);
assert.equal(largeLayout.filter((item) => item.kind === "file").length, 5000);

console.log(JSON.stringify({
  emptyQueryHasNoSections: true,
  historicalEvidenceCannotInsertCards: true,
  fileIndexesRemainPureAndContiguous: true,
  keyboardNavigationRemainsFileOnly: true,
  largeResultLayoutVerified: 5000
}));
