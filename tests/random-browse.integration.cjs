const assert = require("node:assert/strict");
const { orderRandomBrowseItems } = require("../src/renderer/explore/useRandomBrowse.ts");

const items = [..."abcdefghi"].map((filePath) => ({ filePath }));
const originalOrder = items.map(({ filePath }) => filePath);
const firstBatch = orderRandomBrowseItems(items, 42).map(({ filePath }) => filePath);
const repeatedBatch = orderRandomBrowseItems([...items].reverse(), 42).map(({ filePath }) => filePath);
const nextBatch = orderRandomBrowseItems(items, 43).map(({ filePath }) => filePath);

assert.deepEqual(repeatedBatch, firstBatch, "the same seed must not depend on incoming sort order");
assert.notDeepEqual(nextBatch, firstBatch, "advancing the seed must produce a new batch order");
assert.deepEqual(items.map(({ filePath }) => filePath), originalOrder, "random browsing must not mutate search results");

console.log(JSON.stringify({ stableSeedOrder: true, nextBatchChangesOrder: true, sourceOrderPreserved: true }));
