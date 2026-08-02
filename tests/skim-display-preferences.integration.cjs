const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const testRoot = path.join(os.tmpdir(), `cap7ce-skim-display-${process.pid}-${Date.now()}`);
app.setPath("userData", path.join(testRoot, "user-data"));

(async () => {
  try {
    const {
      getUserPreferences,
      updateSearchLabelVisibilityPreference,
      updateSkimDisplayPreference
    } = require("../dist-electron/preferenceStore.js");

    const defaults = await getUserPreferences();
    assert.equal(defaults.skimDisplay.mode, "skim");
    assert.equal(defaults.skimDisplay.showHiddenFiles, false);
    assert.equal(defaults.skimDisplay.customExtensions.includes(".png"), true);
    assert.equal(defaults.searchLabelVisibility.skimDisplay, true);

    const updated = await updateSkimDisplayPreference({
      mode: "custom",
      customExtensions: [".PNG", ".txt", ".txt", "invalid"],
      showHiddenFiles: true
    });
    assert.deepEqual(updated.skimDisplay, {
      mode: "custom",
      customExtensions: [".png", ".txt"],
      showHiddenFiles: true
    });

    await updateSearchLabelVisibilityPreference({
      ...updated.searchLabelVisibility,
      skimDisplay: false
    });
    const reloaded = await getUserPreferences();
    assert.equal(reloaded.skimDisplay.mode, "custom");
    assert.equal(reloaded.searchLabelVisibility.skimDisplay, false);

    console.log(JSON.stringify({
      defaultSkimModeSeeded: true,
      customExtensionsNormalized: true,
      skimModePersisted: true,
      skimLabelVisibilityPersisted: true
    }));
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
})().then(() => {
  app.exit(0);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
