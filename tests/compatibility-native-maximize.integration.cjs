const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const { CompatibilityNativeMaximizeController, isNativeSnapArrangement } = require("../dist-electron/compatibilityNativeMaximizeController.js");

const root = path.resolve(__dirname, "..");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");
const workArea = { x: 0, y: 0, width: 1920, height: 1040 };

assert.equal(isNativeSnapArrangement({ x: 0, y: 0, width: 960, height: 1040 }, workArea), true);
assert.equal(isNativeSnapArrangement({ x: 1280, y: 0, width: 640, height: 1040 }, workArea), true);
assert.equal(isNativeSnapArrangement({ x: 960, y: 520, width: 960, height: 520 }, workArea), true);
assert.equal(isNativeSnapArrangement({ ...workArea }, workArea), false);
assert.equal(isNativeSnapArrangement({ x: 5, y: 5, width: 950, height: 1030 }, workArea), false);
assert.equal(isNativeSnapArrangement({ x: 0, y: 0, width: 900, height: 600 }, workArea), false);

class FakeWindow extends EventEmitter {
  isDestroyed() { return false; }
  getNormalBounds() { return { x: 10, y: 20, width: 300, height: 536 }; }
}

let compatibility = true;
let shellState = "mini";
let enteredNormal = 0;
const restored = [];
const window = new FakeWindow();
const controller = new CompatibilityNativeMaximizeController({
  isCompatibilityMode: () => compatibility,
  getShellState: () => shellState,
  enterNormalMaximized: () => { enteredNormal += 1; },
  restoreShellState: (restore) => restored.push(restore)
});

controller.attach(window);
window.emit("maximize");
assert.equal(enteredNormal, 1);
window.emit("unmaximize");
assert.deepEqual(restored, [{ state: "mini", bounds: { x: 10, y: 20, width: 300, height: 536 } }]);

shellState = "micro";
window.emit("maximize");
controller.cancelRestore();
window.emit("unmaximize");
assert.equal(restored.length, 1);

compatibility = false;
window.emit("maximize");
assert.equal(enteredNormal, 2);
controller.detach();
assert.equal(window.listenerCount("maximize"), 0);
assert.equal(window.listenerCount("unmaximize"), 0);
assert.match(mainSource, /getShellContext: \(\) => \(\{[^}]*?isCompatibilityNativeSnapActive\(\)/u);
assert.match(mainSource, /const evaluateShellResizeThresholds = \(\) => \{[\s\S]*?isCompatibilityNativeSnapActive\(\)/u);
assert.match(mainSource, /const applyEdgeSnapAfterMove = \(\) => \{[\s\S]*?isCompatibilityNativeSnapActive\(\)/u);

console.log(JSON.stringify({
  microAndMiniRestoreCaptured: true,
  cancelledProgrammaticRestoreIgnored: true,
  cap7ceModeIgnored: true,
  listenersDetached: true,
  nativeSideSnapGeometryGuarded: true,
  cap7ceEdgeGapNotMisclassified: true
}));
