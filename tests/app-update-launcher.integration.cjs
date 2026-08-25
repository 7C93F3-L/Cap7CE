const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { app, shell } = require("electron");
const { createAppUpdateLauncherScript, resolveWindowsPowerShellPath } = require("../dist-electron/appUpdateLauncher.js");

const waitForFile = async (filePath, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${path.basename(filePath)}.`);
};

app.whenReady().then(async () => {
  const updateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cap7ce-update-launcher-"));
  const launcherPath = path.join(os.tmpdir(), `Cap7CE-update-launcher-${randomUUID()}.vbs`);
  try {
    const helperPath = path.join(updateRoot, "update-helper.ps1");
    const packagePath = path.join(updateRoot, "missing.zip");
    const installDirectory = path.join(updateRoot, "\u66f4\u65b0 \u6d4b\u8bd5\uff08\u8def\u5f84\uff09");
    fs.copyFileSync(path.join(__dirname, "..", "build", "update-helper.ps1"), helperPath);
    fs.mkdirSync(installDirectory);
    assert.equal(path.isAbsolute(resolveWindowsPowerShellPath()), true);
    const launcherScript = createAppUpdateLauncherScript({
      helperPath,
      packagePath,
      installDirectory,
      expectedVersion: "9.9.9",
      currentProcessId: 999999,
      executableName: "Cap7CE.exe",
      failureCloseDelaySeconds: 0
    });
    assert.equal([...launcherScript].every((character) => character.charCodeAt(0) <= 0x7f), true);
    assert.match(launcherScript, /WScript\.Shell/);
    assert.match(launcherScript, /Run\(updateCommand, 0, True\)/);
    fs.writeFileSync(launcherPath, launcherScript, "utf8");
    assert.equal(await shell.openPath(launcherPath), "");
    await waitForFile(path.join(updateRoot, "helper-failed"), 15_000);
    const log = fs.readFileSync(path.join(updateRoot, "update-helper.log"), "utf8");
    assert.match(log, /Updater started for Cap7CE 9\.9\.9/);
    assert.match(log, /downloaded update package is missing/);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(fs.existsSync(launcherPath), true);
    console.log(JSON.stringify({ shellOpenedLauncher: true, helperScriptExecuted: true, failureSignalWritten: true }));
  } finally {
    fs.rmSync(updateRoot, { recursive: true, force: true });
    fs.rmSync(launcherPath, { force: true });
    app.quit();
  }
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
