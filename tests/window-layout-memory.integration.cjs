const assert = require("node:assert/strict");
const { WindowLayoutManager } = require("../dist-electron/windowLayoutManager.js");

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
const display = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea, scaleFactor: 1 };
const leftTaskbarDisplay = { id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, workArea: { x: 1968, y: 0, width: 1872, height: 1080 }, scaleFactor: 1 };
const profile = { expandedBounds: { x: 100, y: 120, width: 900, height: 600 }, displayId: 1, displayBoundsSnapshot: display.bounds, workAreaSnapshot: workArea, scaleFactor: 1, dockEdge: null, updatedAt: "2026-08-24T00:00:00.000Z" };
const document = { version: 1, lastDockEdge: null, lastDockDisplayId: null, profiles: { normal: profile, micro: profile } };
const writes = [];
const store = { load: async () => document, schedule: (value) => writes.push(value), flush: async () => undefined };
const manager = new WindowLayoutManager(store);
const resolve = (state, fixedHeight) => manager.resolveBounds({
  state,
  displays: [display],
  currentDisplay: display,
  defaultBounds: () => state === "micro" ? { x: 690, y: 879, width: 540, height: 156 } : { x: 320, y: 140, width: 1280, height: 760 },
  minimumSize: { width: 300, height: 156 },
  fixedHeight
});

const run = async () => {
  await manager.load();
  manager.setPreferences({ rememberWindowLayout: false });
  assert.deepEqual(resolve("normal"), { x: 320, y: 140, width: 1280, height: 760 });
  assert.deepEqual(manager.resolveStandbyLinePlacement(display), { display, edge: "bottom" });
  assert.deepEqual(manager.resolveStandbyLinePlacement(leftTaskbarDisplay), { display: leftTaskbarDisplay, edge: "left" });
  assert.equal(manager.captureBounds({ state: "normal", bounds: { x: 5, y: 200, width: 900, height: 600 }, display }), false);
  assert.equal(manager.resolveStandbyLinePlacement(display).edge, "bottom");
  assert.equal(writes.length, 0);
  manager.setPreferences({ rememberWindowLayout: true });
  assert.deepEqual(resolve("normal"), { x: 100, y: 120, width: 900, height: 600 });
  assert.deepEqual(resolve("micro", 156), { x: 100, y: 241, width: 900, height: 156 });
  manager.captureBounds({ state: "normal", bounds: { x: 5, y: 200, width: 900, height: 600 }, display });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].profiles.normal.dockEdge, "left");
  manager.setPreferences({ rememberWindowLayout: false });
  assert.equal(manager.captureBounds({ state: "normal", bounds: profile.expandedBounds, display }), false);
  assert.equal(writes.length, 1);
  console.log(JSON.stringify({ completeBoundsRestoreVerified: true, microFixedHeightVerified: true, userBoundsCaptureVerified: true, standbyLineTaskbarDirectionVerified: true, dockDirectionIndependentFromLineVerified: true, disabledCaptureSkipped: true }));
};

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
