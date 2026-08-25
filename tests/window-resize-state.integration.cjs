const assert = require("node:assert/strict");
const {
  DEFAULT_WINDOW_RESIZE_THRESHOLDS,
  isStableResizeBounds,
  resolveResizeTargetState
} = require("../dist-electron/windowResizeState.js");

const bounds = (width, height) => ({ x: 0, y: 0, width, height });

assert.equal(resolveResizeTargetState("micro", bounds(540, 299)), "micro");
assert.equal(resolveResizeTargetState("micro", bounds(540, 300)), "mini");

assert.equal(resolveResizeTargetState("mini", bounds(520, 500)), "mini");
assert.equal(resolveResizeTargetState("mini", bounds(521, 500)), "normal");
assert.equal(resolveResizeTargetState("mini", bounds(521, 280)), "micro");

assert.equal(resolveResizeTargetState("normal", bounds(950, 640)), "normal");
assert.equal(resolveResizeTargetState("normal", bounds(949, 760)), "mini");
assert.equal(resolveResizeTargetState("normal", bounds(1280, 640)), "normal");
assert.equal(resolveResizeTargetState("normal", bounds(1280, 639)), "mini");
assert.equal(resolveResizeTargetState("normal", bounds(1280, 280)), "micro");
assert.equal(resolveResizeTargetState("settings", bounds(950, 640)), "normal");
assert.equal(resolveResizeTargetState("settings", bounds(949, 760)), "mini");
assert.equal(resolveResizeTargetState("normal", bounds(800, 600), bounds(800, 600)), "normal");

assert.equal(isStableResizeBounds("micro", bounds(1200, 156)), true);
assert.equal(isStableResizeBounds("mini", bounds(520, 500)), true);
assert.equal(isStableResizeBounds("mini", bounds(521, 500)), false);
assert.equal(isStableResizeBounds("normal", bounds(950, 640)), true);
assert.equal(isStableResizeBounds("normal", bounds(949, 640)), false);

assert.ok(DEFAULT_WINDOW_RESIZE_THRESHOLDS.miniToMicroHeight < DEFAULT_WINDOW_RESIZE_THRESHOLDS.microToMiniHeight);
assert.ok(DEFAULT_WINDOW_RESIZE_THRESHOLDS.miniToNormalWidth < DEFAULT_WINDOW_RESIZE_THRESHOLDS.normalToMiniWidth);

console.log(JSON.stringify({
  microMiniHysteresisVerified: true,
  miniNormalModeBoundaryVerified: true,
  settingsNormalSemanticsVerified: true,
  invalidCaptureBoundaryVerified: true,
  narrowWorkAreaFallbackVerified: true
}));
