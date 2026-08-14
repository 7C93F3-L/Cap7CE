const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

(async () => {
  const { consumeAppUpdateCompletion } = require("../dist-electron/appUpdateCompletion.js");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-update-completion-"));
  try {
    const markerPath = path.join(root, "install", ".cap7ce-update-completed");
    const statePath = path.join(root, "user", "config", "app-version.json");
    await fs.mkdir(path.dirname(markerPath), { recursive: true });
    await fs.writeFile(markerPath, "0.9.3\n", "ascii");

    assert.equal(await consumeAppUpdateCompletion({ currentVersion: "0.9.3", installMarkerPath: markerPath, versionStatePath: statePath }), "0.9.3");
    await assert.rejects(fs.access(markerPath));
    assert.equal(await consumeAppUpdateCompletion({ currentVersion: "0.9.3", installMarkerPath: markerPath, versionStatePath: statePath }), null);
    await fs.writeFile(markerPath, "0.9.3\n", "ascii");
    assert.equal(await consumeAppUpdateCompletion({ currentVersion: "0.9.3", installMarkerPath: markerPath, versionStatePath: statePath }), null);
    await assert.rejects(fs.access(markerPath));
    assert.equal(await consumeAppUpdateCompletion({ currentVersion: "0.9.4", installMarkerPath: markerPath, versionStatePath: statePath }), "0.9.4");

    const legacyStatePath = path.join(root, "legacy", "config", "app-version.json");
    const legacyPreferencesPath = path.join(root, "legacy", "config", "preferences.json");
    await fs.mkdir(path.dirname(legacyPreferencesPath), { recursive: true });
    await fs.writeFile(legacyPreferencesPath, "{}\n", "utf8");
    assert.equal(await consumeAppUpdateCompletion({
      currentVersion: "0.9.3",
      installMarkerPath: path.join(root, "legacy-install", ".cap7ce-update-completed"),
      versionStatePath: legacyStatePath,
      legacyUserDataPaths: [legacyPreferencesPath]
    }), "0.9.3");
    assert.equal(await consumeAppUpdateCompletion({
      currentVersion: "0.9.3",
      installMarkerPath: path.join(root, "legacy-install", ".cap7ce-update-completed"),
      versionStatePath: legacyStatePath,
      legacyUserDataPaths: [legacyPreferencesPath]
    }), null);

    const freshStatePath = path.join(root, "fresh", "config", "app-version.json");
    assert.equal(await consumeAppUpdateCompletion({
      currentVersion: "0.9.3",
      installMarkerPath: path.join(root, "fresh-install", ".cap7ce-update-completed"),
      versionStatePath: freshStatePath,
      legacyUserDataPaths: [path.join(root, "fresh", "config", "preferences.json")]
    }), null);

    console.log(JSON.stringify({ helperMarkerConsumedOnce: true, versionTransitionDetected: true, legacyUpgradeDetected: true, freshInstallIgnored: true }));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
