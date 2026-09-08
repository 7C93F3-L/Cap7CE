const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { AppUpdateInstallIntentStore } = require("../dist-electron/appUpdateInstallIntent.js");

const exists = async (targetPath) => fs.access(targetPath).then(() => true).catch(() => false);

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-update-install-intent-"));
  const markerPath = path.join(root, "install-intent.json");
  try {
    const store = new AppUpdateInstallIntentStore(root);
    assert.equal(await store.getCompletedVersion("1.0.0"), null, "fresh installs must not report an update");

    await store.record("1.0.1");
    assert.equal(await store.getCompletedVersion("1.0.0"), null, "the old process must not consume a future target");
    assert.equal(await exists(markerPath), true);
    assert.equal(await store.getCompletedVersion("1.0.1"), "1.0.1");
    assert.equal(await store.clear("1.0.0"), false, "a different app copy must not clear the target");
    assert.equal(await store.clear("1.0.1"), true);
    assert.equal(await exists(markerPath), false);

    await store.record("1.0.1");
    assert.equal(await store.getCompletedVersion("1.0.2"), null, "a skipped target must not report success");
    assert.equal(await exists(markerPath), false, "stale targets should be discarded");

    await fs.writeFile(markerPath, "not-json", "utf8");
    assert.equal(await store.getCompletedVersion("1.0.2"), null);
    assert.equal(await exists(markerPath), false, "invalid intent files should be removed safely");
    await assert.rejects(store.record("latest"), TypeError);

    console.log(JSON.stringify({ freshInstallIgnored: true, exactTargetConsumedOnce: true, futureTargetPreserved: true, staleAndInvalidTargetsRemoved: true }));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
