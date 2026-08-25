const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { app, BrowserWindow } = require("electron");

const {
  isPageZoomShortcut,
  lockWebContentsZoom
} = require("../dist-electron/webContentsZoomPolicy.js");

const input = (overrides = {}) => ({
  alt: false,
  code: "KeyA",
  control: false,
  key: "a",
  meta: false,
  ...overrides
});

assert.equal(isPageZoomShortcut(input({ control: true, code: "Minus", key: "-" })), true);
assert.equal(isPageZoomShortcut(input({ control: true, code: "Equal", key: "+" })), true);
assert.equal(isPageZoomShortcut(input({ control: true, code: "Digit0", key: "0" })), true);
assert.equal(isPageZoomShortcut(input({ control: true, code: "NumpadSubtract", key: "-" })), true);
assert.equal(isPageZoomShortcut(input({ control: true, code: "NumpadAdd", key: "+" })), true);
assert.equal(isPageZoomShortcut(input({ control: true })), false);
assert.equal(isPageZoomShortcut(input({ control: true, alt: true, code: "Minus", key: "-" })), false);

class FakeWebContents extends EventEmitter {
  destroyed = false;
  zoomFactor = 0.25;

  isDestroyed() {
    return this.destroyed;
  }

  setZoomFactor(factor) {
    this.zoomFactor = factor;
  }
}

const webContents = new FakeWebContents();
lockWebContentsZoom(webContents);
assert.equal(webContents.zoomFactor, 1);

const zoomShortcutEvent = { prevented: false, preventDefault() { this.prevented = true; } };
webContents.zoomFactor = 0.25;
webContents.emit("before-input-event", zoomShortcutEvent, input({ control: true, code: "Minus", key: "-" }));
assert.equal(zoomShortcutEvent.prevented, true);
assert.equal(webContents.zoomFactor, 1);

const ordinaryShortcutEvent = { prevented: false, preventDefault() { this.prevented = true; } };
webContents.zoomFactor = 0.75;
webContents.emit("before-input-event", ordinaryShortcutEvent, input({ control: true }));
assert.equal(ordinaryShortcutEvent.prevented, false);
assert.equal(webContents.zoomFactor, 0.75);

const wheelZoomEvent = { prevented: false, preventDefault() { this.prevented = true; } };
webContents.emit("zoom-changed", wheelZoomEvent, "out");
assert.equal(wheelZoomEvent.prevented, true);
assert.equal(webContents.zoomFactor, 1);

webContents.zoomFactor = 0.5;
webContents.emit("did-finish-load");
assert.equal(webContents.zoomFactor, 1);

const run = async () => {
  await app.whenReady();
  const window = new BrowserWindow({
    width: 180,
    height: 39,
    frame: false,
    show: false,
    transparent: true
  });
  lockWebContentsZoom(window.webContents);
  await window.loadURL("data:text/html,<body>zoom viewport probe</body>");
  const viewport = await window.webContents.executeJavaScript(`({
    width: window.innerWidth,
    height: window.innerHeight,
    zoomFactor: window.devicePixelRatio
  })`);
  assert.ok(viewport.width > 0 && viewport.width < 1000, `unexpected viewport width: ${viewport.width}`);
  assert.ok(viewport.height > 0 && viewport.height < 1000, `unexpected viewport height: ${viewport.height}`);
  assert.equal(window.webContents.getZoomFactor(), 1);
  window.destroy();
  console.log(JSON.stringify({
    keyboardPageZoomBlocked: true,
    mouseWheelPageZoomBlocked: true,
    persistedZoomRestoredAfterLoad: true,
    ordinaryShortcutsPreserved: true,
    transparentWindowViewportPreserved: viewport
  }));
  app.quit();
};

void run().catch((error) => {
  console.error(error);
  app.exit(1);
});
