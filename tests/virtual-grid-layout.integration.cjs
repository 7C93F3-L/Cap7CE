const assert = require("node:assert/strict");
const {
  getImageGridLayout,
  getResultLayoutMode,
  getScrollLeftToRevealItem,
  getScrollTopToRevealItem
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

console.log(JSON.stringify({
  microHorizontalLayoutVerified: true,
  miniAndNormalColumnLayoutVerified: true,
  verticalRevealBoundariesVerified: true,
  horizontalRevealBoundariesVerified: true
}));
