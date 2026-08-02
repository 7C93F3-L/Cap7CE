const assert = require("node:assert/strict");

const {
  getBottomAnchoredInteractiveBounds,
  getShellMousePollDelay,
  shellMouseActivePollMs,
  shellMouseIdlePollMs,
  shellMouseMediumPollMs
} = require("../dist-electron/shellMousePollingPolicy.js");

const bounds = { x: 1000, y: 800, width: 180, height: 4 };
const nativeMinimumBounds = { x: 1000, y: 765, width: 180, height: 39 };

assert.deepEqual(
  getBottomAnchoredInteractiveBounds(nativeMinimumBounds, 15),
  { x: 1000, y: 789, width: 180, height: 15 }
);
assert.deepEqual(getBottomAnchoredInteractiveBounds(bounds, 15), bounds);

assert.equal(getShellMousePollDelay({ x: 1050, y: 801 }, bounds, 20), shellMouseActivePollMs);
assert.equal(getShellMousePollDelay({ x: 1050, y: 700 }, bounds, 20), shellMouseActivePollMs);
assert.equal(getShellMousePollDelay({ x: 1050, y: 500 }, bounds, 20), shellMouseMediumPollMs);
assert.equal(getShellMousePollDelay({ x: 100, y: 100 }, bounds, 20), shellMouseIdlePollMs);
assert.equal(getShellMousePollDelay({ x: 100, y: 100 }, bounds, 0), shellMouseActivePollMs);
assert.equal(getShellMousePollDelay({ x: 100, y: 100 }, bounds, 3), shellMouseActivePollMs);

console.log(JSON.stringify({
  standbyInteractionClampedToBottom15Px: true,
  insideRemainsResponsive: true,
  nearbyRemainsResponsive: true,
  mediumDistanceBacksOff: true,
  distantIdleBacksOff: true,
  pointerMovementRestoresFastPolling: true
}));
