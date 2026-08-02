const assert = require("node:assert/strict");

const release = (version, overrides = {}) => ({
  tag_name: `v${version}`,
  draft: false,
  assets: [{
    name: `Cap7CE-${version}-win-x64.zip`,
    state: "uploaded",
    browser_download_url: `https://github.com/7C93F3-L/Cap7CE/releases/download/v${version}/Cap7CE-${version}-win-x64.zip`
  }],
  ...overrides
});

(async () => {
  const { checkForAppUpdate, selectLatestAppUpdate } = require("../dist-electron/appUpdateService.js");

  const latest = selectLatestAppUpdate([
    release("0.8.1"),
    release("0.9.0", { draft: true }),
    release("0.8.2", {
      assets: [{
        name: "Cap7CE-0.8.2-win-x64.zip",
        state: "uploaded",
        browser_download_url: "https://example.com/Cap7CE-0.8.2-win-x64.zip"
      }]
    })
  ]);
  assert.deepEqual(latest, {
    version: "0.8.1",
    downloadUrl: "https://github.com/7C93F3-L/Cap7CE/releases/download/v0.8.1/Cap7CE-0.8.1-win-x64.zip"
  });

  const available = await checkForAppUpdate(
    "0.8.0",
    async () => ({
      ok: true,
      json: async () => [release("0.8.1")]
    })
  );
  assert.equal(available.status, "update_available");
  assert.equal(available.latestVersion, "0.8.1");
  assert.equal(available.downloadUrl, "https://github.com/7C93F3-L/Cap7CE/releases/download/v0.8.1/Cap7CE-0.8.1-win-x64.zip");

  const current = await checkForAppUpdate(
    "0.8.1",
    async () => ({
      ok: true,
      json: async () => [release("0.8.1"), release("0.8.0")]
    })
  );
  assert.equal(current.status, "up_to_date");
  assert.equal(current.latestVersion, "0.8.1");
  assert.equal(current.downloadUrl, undefined);

  const unavailable = await checkForAppUpdate(
    "0.8.0",
    async () => ({ ok: false })
  );
  assert.equal(unavailable.status, "failed");

  console.log("App update integration checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
