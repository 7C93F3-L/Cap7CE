const assert = require("node:assert/strict");
const { PreviewWindowPresentationSizing } = require("../dist-electron/previewWindowPresentationSizing.js");

const sizing = new PreviewWindowPresentationSizing({
  minimumWidth: 360,
  minimumHeight: 280,
  horizontalPadding: 50,
  verticalChrome: 24,
  workAreaRatio: 0.85
});
const workArea = { x: 0, y: 0, width: 1920, height: 1040 };

assert.deepEqual(sizing.getOuterMinimumSize(0), { width: 360, height: 280 });
assert.deepEqual(sizing.getOuterMinimumSize(36), { width: 360, height: 316 });

const cap7ceBounds = sizing.resolveBounds({ contentWidth: 800, contentHeight: 600, currentBounds: null, workArea, titlebarHeight: 0 });
const compatibilityBounds = sizing.resolveBounds({ contentWidth: 800, contentHeight: 600, currentBounds: null, workArea, titlebarHeight: 36 });
assert.equal(compatibilityBounds.width, cap7ceBounds.width);
assert.equal(compatibilityBounds.height, cap7ceBounds.height + 36);
assert.equal(compatibilityBounds.x + Math.round(compatibilityBounds.width / 2), cap7ceBounds.x + Math.round(cap7ceBounds.width / 2));
assert.equal(compatibilityBounds.y + Math.round(compatibilityBounds.height / 2), cap7ceBounds.y + Math.round(cap7ceBounds.height / 2));

const anchoredBounds = sizing.resolveBounds({
  contentWidth: 500,
  contentHeight: 400,
  currentBounds: { x: 100, y: 120, width: 900, height: 636 },
  workArea,
  titlebarHeight: 36
});
assert.equal(anchoredBounds.x + Math.round(anchoredBounds.width / 2), 550);
assert.equal(anchoredBounds.y + Math.round(anchoredBounds.height / 2), 438);

const constrainedBounds = sizing.resolveBounds({ contentWidth: 4000, contentHeight: 3000, currentBounds: null, workArea: { x: 0, y: 0, width: 640, height: 400 }, titlebarHeight: 36 });
assert.ok(constrainedBounds.width <= 640);
assert.ok(constrainedBounds.height <= 400);
assert.ok(constrainedBounds.x >= 0 && constrainedBounds.y >= 0);

console.log(JSON.stringify({
  cap7cePreviewSizeUnchanged: true,
  compatibilityTitlebarAddedOutsideContent: true,
  currentOuterCenterPreserved: true,
  narrowWorkAreaClamped: true
}));
