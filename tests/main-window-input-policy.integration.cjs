const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { app, BrowserWindow } = require("electron");
const {
  installMainWindowInputPolicy,
  isMainWindowRefreshShortcut
} = require("../dist-electron/webContentsInputPolicy.js");

assert.equal(isMainWindowRefreshShortcut({ type: "keyDown", key: "F5", code: "F5" }), true);
assert.equal(isMainWindowRefreshShortcut({ type: "keyUp", key: "F5", code: "F5" }), false);
assert.equal(isMainWindowRefreshShortcut({ type: "keyDown", key: "F5", code: "F5", control: true }), false);

const webContents = new EventEmitter();
const sent = [];
webContents.send = (channel) => sent.push(channel);
installMainWindowInputPolicy(webContents);

let prevented = 0;
webContents.emit("before-input-event", { preventDefault: () => { prevented += 1; } }, {
  type: "keyDown",
  key: "F5",
  code: "F5",
  isAutoRepeat: false
});
webContents.emit("before-input-event", { preventDefault: () => { prevented += 1; } }, {
  type: "keyDown",
  key: "F5",
  code: "F5",
  isAutoRepeat: true
});
webContents.emit("before-input-event", { preventDefault: () => { prevented += 1; } }, {
  type: "keyDown",
  key: "F6",
  code: "F6",
  isAutoRepeat: false
});

assert.equal(prevented, 2);
assert.deepEqual(sent, ["window:refreshCurrentPageRequested"]);

const run = async () => {
  await app.whenReady();
  const window = new BrowserWindow({ width: 320, height: 240, show: false });
  const observedInputs = [];
  let refreshRequests = 0;
  window.webContents.on("before-input-event", (_event, input) => {
    observedInputs.push({ type: input.type, key: input.key, code: input.code, isAutoRepeat: input.isAutoRepeat });
  });
  installMainWindowInputPolicy(window.webContents, () => { refreshRequests += 1; });
  await window.loadURL("data:text/html,<body><input autofocus></body>");
  window.webContents.sendInputEvent({ type: "keyDown", keyCode: "F5" });
  window.webContents.sendInputEvent({ type: "keyUp", keyCode: "F5" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(refreshRequests, 1, JSON.stringify(observedInputs));
  assert.equal(observedInputs.some((input) => input.type === "keyDown" && (input.key === "F5" || input.code === "F5")), true);
  window.destroy();
  console.log(JSON.stringify({ nativeF5ReloadBlocked: true, rendererRefreshRequestedOnce: true, realElectronInputVerified: true, observedInputs }));
  app.quit();
};

void run().catch((error) => {
  console.error(error);
  app.exit(1);
});
