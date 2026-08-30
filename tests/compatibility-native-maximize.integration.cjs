const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { CompatibilityNativeMaximizeController } = require("../dist-electron/compatibilityNativeMaximizeController.js");

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

console.log(JSON.stringify({
  microAndMiniRestoreCaptured: true,
  cancelledProgrammaticRestoreIgnored: true,
  cap7ceModeIgnored: true,
  listenersDetached: true
}));
