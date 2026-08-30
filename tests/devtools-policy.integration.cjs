const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const root = path.resolve(__dirname, "..");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");
const lineControllerSource = fs.readFileSync(path.join(root, "electron", "lineWindowController.ts"), "utf8");
const capsuleControllerSource = fs.readFileSync(path.join(root, "electron", "capsuleWindowController.ts"), "utf8");

assert.equal(
  (mainSource.match(/devTools:\s*!app\.isPackaged/g) ?? []).length,
  3,
  "main, preview and startup windows must disable DevTools only when packaged"
);
assert.match(mainSource, /devToolsEnabled:\s*!app\.isPackaged/);
assert.match(lineControllerSource, /devToolsEnabled:\s*boolean/);
assert.match(lineControllerSource, /devTools:\s*this\.options\.devToolsEnabled/);
assert.match(capsuleControllerSource, /devToolsEnabled:\s*boolean/);
assert.match(capsuleControllerSource, /devTools:\s*this\.options\.devToolsEnabled/);
assert.doesNotMatch(mainSource, /(?:open|toggle)DevTools\s*\(/);

const run = async () => {
  await app.whenReady();
  const window = new BrowserWindow({
    show: false,
    webPreferences: { devTools: false }
  });
  await window.loadURL("data:text/html,<body>devtools policy probe</body>");

  window.webContents.openDevTools();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(window.webContents.isDevToolsOpened(), false);

  window.webContents.sendInputEvent({ type: "keyDown", keyCode: "I", modifiers: ["control", "shift"] });
  window.webContents.sendInputEvent({ type: "keyUp", keyCode: "I", modifiers: ["control", "shift"] });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(window.webContents.isDevToolsOpened(), false);

  window.destroy();
  console.log(JSON.stringify({
    packagedRendererDevToolsDisabled: true,
    developmentRendererDevToolsPreserved: true,
    mainPreviewLineCapsuleAndStartupWindowsCovered: true,
    openDevToolsAndKeyboardProbeBlocked: true
  }));
  app.quit();
};

void run().catch((error) => {
  console.error(error);
  app.exit(1);
});
