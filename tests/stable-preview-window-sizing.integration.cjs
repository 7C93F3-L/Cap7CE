const assert = require("node:assert/strict");
const { getStablePreviewContentChrome, StablePreviewWindowSizing } = require("../dist-electron/stablePreviewWindowSizing.js");

const sizing = new StablePreviewWindowSizing({
  minimumWidth: 320,
  minimumHeight: 240,
  horizontalPadding: 5,
  verticalChrome: 5,
  workAreaRatio: 0.85
});
const workArea = { x: 0, y: 0, width: 1920, height: 1040 };

assert.deepEqual(sizing.getOuterMinimumSize(), { width: 320, height: 280 });
assert.deepEqual(getStablePreviewContentChrome(), { horizontalPadding: 45, verticalChrome: 5 });
assert.deepEqual(getStablePreviewContentChrome(320), { horizontalPadding: 325, verticalChrome: 5 });

const bounds = sizing.resolveBounds({
  contentWidth: 800,
  contentHeight: 600,
  currentBounds: null,
  workArea,
  ...getStablePreviewContentChrome(320)
});
assert.deepEqual(bounds, { x: 397, y: 197, width: 1125, height: 645 });

const constrained = sizing.resolveBounds({
  contentWidth: 4000,
  contentHeight: 3000,
  currentBounds: null,
  workArea: { x: 0, y: 0, width: 640, height: 400 },
  ...getStablePreviewContentChrome(320)
});
assert.ok(constrained.width <= 544);
assert.ok(constrained.height <= 380);
assert.ok(constrained.x >= 0 && constrained.y >= 0);

console.log(JSON.stringify({
  stableTitlebarIncluded: true,
  sidebarChromeIncluded: true,
  workAreaConstraintVerified: true
}));
