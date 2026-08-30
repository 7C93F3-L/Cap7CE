const assert = require("node:assert/strict");
const {
  toWindowContentBounds,
  toWindowContentWorkArea,
  toWindowOuterBounds,
  toWindowOuterMinimumSize
} = require("../dist-electron/windowPresentationGeometry.js");

const contentBounds = { x: 100, y: 200, width: 540, height: 156 };
assert.deepEqual(toWindowOuterBounds(contentBounds, 36, "top"), {
  x: 100, y: 200, width: 540, height: 192
});
assert.deepEqual(toWindowOuterBounds(contentBounds, 36, "center"), {
  x: 100, y: 182, width: 540, height: 192
});
assert.deepEqual(toWindowOuterBounds(contentBounds, 36, "bottom"), {
  x: 100, y: 164, width: 540, height: 192
});
assert.deepEqual(toWindowContentBounds({ x: 100, y: 164, width: 540, height: 192 }, 36), contentBounds);
assert.deepEqual(toWindowOuterMinimumSize({ width: 300, height: 156 }, 36), { width: 300, height: 192 });
assert.deepEqual(toWindowContentWorkArea({ x: 0, y: 0, width: 1920, height: 1040 }, 36), {
  x: 0, y: 36, width: 1920, height: 1004
});
assert.deepEqual(toWindowOuterBounds(contentBounds, 0, "bottom"), contentBounds);

console.log(JSON.stringify({
  topCenterAndBottomAnchorsVerified: true,
  outerAndContentHeightRoundTripVerified: true,
  compatibilityMinimumSizeVerified: true,
  cap7ceZeroHeightIdentityVerified: true
}));
