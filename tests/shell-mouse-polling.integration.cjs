const assert = require("node:assert/strict");

const {
  getShellMousePollDelay,
  shellMouseActivePollMs,
  shellMouseIdlePollMs,
  shellMouseMediumPollMs
} = require("../dist-electron/shellMousePollingPolicy.js");

const bounds = { x: 940, y: 744, width: 300, height: 44 };

assert.equal(getShellMousePollDelay({ x: 1050, y: 801 }, bounds, 20), shellMouseActivePollMs);
assert.equal(getShellMousePollDelay({ x: 1050, y: 700 }, bounds, 20), shellMouseActivePollMs);
assert.equal(getShellMousePollDelay({ x: 1050, y: 500 }, bounds, 20), shellMouseMediumPollMs);
assert.equal(getShellMousePollDelay({ x: 100, y: 100 }, bounds, 20), shellMouseIdlePollMs);
assert.equal(getShellMousePollDelay({ x: 100, y: 100 }, bounds, 0), shellMouseActivePollMs);
assert.equal(getShellMousePollDelay({ x: 100, y: 100 }, bounds, 3), shellMouseActivePollMs);

console.log(JSON.stringify({
  capsuleBoundsUsedDirectly: true,
  insideRemainsResponsive: true,
  nearbyRemainsResponsive: true,
  mediumDistanceBacksOff: true,
  distantIdleBacksOff: true,
  pointerMovementRestoresFastPolling: true
}));
