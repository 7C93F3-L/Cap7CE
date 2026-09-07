const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const release = (version, overrides = {}) => {
  const payload = Buffer.from(`installer-${version}`);
  return {
    tag_name: `v${version}`,
    draft: false,
    prerelease: false,
    assets: [{
      id: Number(version.replaceAll(".", "")) + 100,
      name: `Cap7CE-Setup-${version}-x64.exe`,
      state: "uploaded",
      size: payload.length,
      digest: `sha256:${sha256(payload)}`,
      browser_download_url: `https://github.com/7C93F3-L/Cap7CE/releases/download/v${version}/Cap7CE-Setup-${version}-x64.exe`
    }],
    ...overrides
  };
};

(async () => {
  const { checkForAppUpdate, selectLatestAppUpdate } = require("../dist-electron/appUpdateService.js");

  const latest = selectLatestAppUpdate([
    release("0.9.8"),
    release("1.0.0", { draft: true }),
    release("0.9.9", { assets: [{
      id: 999,
      name: "Cap7CE-Setup-0.9.9-x64.exe",
      state: "uploaded",
      size: 100,
      digest: `sha256:${"a".repeat(64)}`,
      browser_download_url: "https://example.com/Cap7CE-Setup-0.9.9-x64.exe"
    }] })
  ]);
  assert.equal(latest.version, "0.9.8");
  assert.equal(latest.assetName, "Cap7CE-Setup-0.9.8-x64.exe");
  assert.equal(latest.uploadState, "uploaded");
  assert.equal(latest.digest.length, 64);

  const invalidRelease = release("1.0.0");
  invalidRelease.assets[0].digest = null;
  assert.equal(selectLatestAppUpdate([invalidRelease]), null, "missing GitHub digest must reject the asset");
  assert.equal(selectLatestAppUpdate([release("1.0.0", { prerelease: true })]), null, "prerelease installers must not enter the stable update channel");
  const zipRelease = release("1.0.0");
  zipRelease.assets[0].name = "Cap7CE-1.0.0-win-x64.zip";
  assert.equal(selectLatestAppUpdate([zipRelease]), null, "legacy ZIP assets must never be selected");

  const available = await checkForAppUpdate("0.9.9", async () => ({ ok: true, json: async () => [release("1.0.0")] }));
  assert.equal(available.status, "update_available");
  assert.equal(available.latestVersion, "1.0.0");
  assert.equal(available.asset.assetId, 200);
  assert.equal("downloadUrl" in available, false, "trusted asset details stay internal instead of becoming renderer parameters");

  const current = await checkForAppUpdate("1.0.0", async () => ({ ok: true, json: async () => [release("1.0.0")] }));
  assert.equal(current.status, "up_to_date");
  assert.equal(current.asset, undefined);
  assert.equal((await checkForAppUpdate("0.9.9", async () => ({ ok: false }))).status, "failed");

  console.log(JSON.stringify({
    exactInstallerAssetSelected: true,
    releaseIdentityAndDigestRequired: true,
    legacyZipRejected: true,
    untrustedUrlRejected: true,
    rendererReceivesNoAssetUrl: true
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
