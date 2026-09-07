const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");

const { registerAppUpdateIpc } = require("../dist-electron/appUpdateIpc.js");

const payload = Buffer.from("installer-1.0.0");
const release = {
  tag_name: "v1.0.0",
  draft: false,
  prerelease: false,
  assets: [{
    id: 200,
    name: "Cap7CE-Setup-1.0.0-x64.exe",
    state: "uploaded",
    size: payload.length,
    digest: `sha256:${createHash("sha256").update(payload).digest("hex")}`,
    browser_download_url: "https://github.com/7C93F3-L/Cap7CE/releases/download/v1.0.0/Cap7CE-Setup-1.0.0-x64.exe"
  }]
};

(async () => {
  const handlers = new Map();
  const allowedEvent = { sender: { id: 1 } };
  let selectedAsset = null;
  let quitRequests = 0;
  let installResult = { status: "failed", version: "1.0.0", reason: "unknown" };
  const state = { status: "idle" };
  const service = {
    getState: () => state,
    setAvailableAsset: async (asset) => { selectedAsset = asset; },
    isBusy: () => false,
    download: async () => ({ status: "ready", version: "1.0.0", receivedBytes: payload.length, totalBytes: payload.length, percent: 100 }),
    pause: () => true,
    discard: async () => undefined,
    openReadyInstaller: async () => installResult
  };

  registerAppUpdateIpc({
    registrar: { handle: (channel, listener) => handlers.set(channel, listener) },
    isSenderAllowed: (event) => event === allowedEvent,
    currentVersion: "0.9.9",
    isPackaged: true,
    service,
    requestQuit: () => { quitRequests += 1; },
    fetchReleases: async () => ({ ok: true, json: async () => [release] })
  });

  assert.deepEqual([...handlers.keys()].sort(), [
    "app:checkForUpdates",
    "app:discardUpdate",
    "app:downloadUpdate",
    "app:getUpdateState",
    "app:installUpdate",
    "app:pauseUpdateDownload"
  ]);

  const checkResult = await handlers.get("app:checkForUpdates")(allowedEvent, "https://attacker.invalid/update.exe");
  assert.equal(checkResult.status, "update_available");
  assert.equal(selectedAsset.assetId, 200, "only the main process may select the trusted release asset");
  assert.equal(JSON.stringify(checkResult).includes("browser_download_url"), false);
  assert.equal(JSON.stringify(checkResult).includes("github.com"), false, "renderer response must not expose a reusable installer URL");

  assert.deepEqual(await handlers.get("app:getUpdateState")({ sender: { id: 2 } }), { status: "idle" });
  assert.deepEqual(await handlers.get("app:downloadUpdate")({ sender: { id: 2 } }), { status: "failed", reason: "invalid" });
  assert.equal(handlers.get("app:pauseUpdateDownload")({ sender: { id: 2 } }), false);
  assert.equal(await handlers.get("app:discardUpdate")({ sender: { id: 2 } }), false);

  assert.equal((await handlers.get("app:installUpdate")(allowedEvent)).status, "failed");
  assert.equal(quitRequests, 0, "installer open failure must leave Cap7CE running");
  installResult = { status: "installing", version: "1.0.0" };
  assert.equal((await handlers.get("app:installUpdate")(allowedEvent)).status, "installing");
  assert.equal(quitRequests, 1, "Cap7CE may quit only after the installer launches successfully");

  console.log(JSON.stringify({
    rendererCannotChooseDownloadUrl: true,
    senderPermissionsVerified: true,
    openFailureKeepsAppRunning: true,
    openSuccessRequestsQuit: true
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
