const assert = require("node:assert/strict");
const {
  captureResultGridScrollMemory,
  createInitialResultGridScrollMemory,
  getImageGridLayout,
  getResultLayoutMode,
  getScrollLeftToRevealItem,
  getScrollTopToRevealItem,
  restoreResultGridScrollOffset
} = require("../src/renderer/virtualGridLayout.ts");

assert.equal(getResultLayoutMode("micro"), "micro");
assert.equal(getResultLayoutMode("mini"), "mini");
assert.equal(getResultLayoutMode("settings"), "normal");
assert.deepEqual(getImageGridLayout("micro", 800, 100), {
  cellSize: 100,
  columnCount: 5,
  contentWidth: 800,
  isHorizontal: true
});
assert.deepEqual(getImageGridLayout("mini", 300, 500), {
  cellSize: 147.5,
  columnCount: 2,
  contentWidth: 300,
  isHorizontal: false
});
assert.deepEqual(getImageGridLayout("normal", 620, 500), {
  cellSize: 151.25,
  columnCount: 4,
  contentWidth: 620,
  isHorizontal: false
});
assert.deepEqual(createInitialResultGridScrollMemory(), {
  layoutMode: "normal",
  offset: 0,
  progress: 0,
  anchorItemId: null,
  atEnd: false
});

const metrics = {
  scrollTop: 100,
  scrollLeft: 100,
  scrollHeight: 1000,
  scrollWidth: 1000,
  clientHeight: 200,
  clientWidth: 200
};
assert.equal(getScrollTopToRevealItem(metrics, 80, 50, 5), 75);
assert.equal(getScrollTopToRevealItem(metrics, 150, 50, 5), 100);
assert.equal(getScrollTopToRevealItem(metrics, 280, 50, 5), 135);
assert.equal(getScrollLeftToRevealItem(metrics, 80, 50, 5), 75);
assert.equal(getScrollLeftToRevealItem(metrics, 150, 50, 5), 100);
assert.equal(getScrollLeftToRevealItem(metrics, 280, 50, 5), 135);

const layoutItemIds = Array.from({ length: 100 }, (_, index) => `item-${index}`);
layoutItemIds[42] = null;
const normalMemory = captureResultGridScrollMemory({
  layoutMode: "normal",
  offset: 930,
  maxOffset: 3000,
  viewportExtent: 500,
  cellSize: 150,
  columnCount: 4,
  itemIds: layoutItemIds
});
assert.equal(normalMemory.anchorItemId, "item-30");
assert.equal(restoreResultGridScrollOffset({
  memory: normalMemory,
  layoutMode: "mini",
  maxOffset: 7000,
  viewportExtent: 500,
  cellSize: 150,
  columnCount: 2,
  itemIds: layoutItemIds
}), 2150);
assert.equal(restoreResultGridScrollOffset({
  memory: normalMemory,
  layoutMode: "normal",
  maxOffset: 3000,
  viewportExtent: 500,
  cellSize: 150,
  columnCount: 4,
  itemIds: layoutItemIds
}), 930);

const endMemory = captureResultGridScrollMemory({
  layoutMode: "normal",
  offset: 2999.5,
  maxOffset: 3000,
  viewportExtent: 500,
  cellSize: 150,
  columnCount: 4,
  itemIds: layoutItemIds
});
assert.equal(endMemory.atEnd, true);
assert.equal(restoreResultGridScrollOffset({
  memory: endMemory,
  layoutMode: "micro",
  maxOffset: 12000,
  viewportExtent: 800,
  cellSize: 150,
  columnCount: 5,
  itemIds: layoutItemIds
}), 12000);

const missingAnchorMemory = { ...normalMemory, anchorItemId: "removed-item", progress: 0.25 };
assert.equal(restoreResultGridScrollOffset({
  memory: missingAnchorMemory,
  layoutMode: "micro",
  maxOffset: 12000,
  viewportExtent: 800,
  cellSize: 150,
  columnCount: 5,
  itemIds: layoutItemIds
}), 3000);

console.log(JSON.stringify({
  microHorizontalLayoutVerified: true,
  miniAndNormalColumnLayoutVerified: true,
  verticalRevealBoundariesVerified: true,
  horizontalRevealBoundariesVerified: true,
  crossLayoutFileAnchorVerified: true,
  sameLayoutExactOffsetVerified: true,
  crossLayoutEndLockVerified: true,
  missingAnchorProgressFallbackVerified: true
}));
