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
      updateSkimDisplayPreference,
      updateSkimSortPreference,
      updateSortPreference
    } = require("../dist-electron/preferenceStore.js");

    const defaults = await getUserPreferences();
    assert.equal(defaults.skimDisplay.mode, "skim");
    assert.equal(defaults.skimDisplay.showHiddenFiles, false);
    assert.equal(defaults.skimDisplay.customExtensions.includes(".png"), true);
    assert.equal(defaults.searchLabelVisibility.skimDisplay, true);
    assert.deepEqual(defaults.skimSortPreference, {
      sortField: "file_name",
      sortDirection: "asc"
    });

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
    await updateSortPreference({ sortField: "modified_at", sortDirection: "desc" });
    await updateSkimSortPreference({ sortField: "file_name", sortDirection: "desc" });
    const reloaded = await getUserPreferences();
    assert.equal(reloaded.skimDisplay.mode, "custom");
    assert.equal(reloaded.searchLabelVisibility.skimDisplay, false);
    assert.deepEqual(reloaded.sortPreference, { sortField: "modified_at", sortDirection: "desc" });
    assert.deepEqual(reloaded.skimSortPreference, { sortField: "file_name", sortDirection: "desc" });

    console.log(JSON.stringify({
      defaultSkimModeSeeded: true,
      customExtensionsNormalized: true,
      skimModePersisted: true,
      skimLabelVisibilityPersisted: true,
      independentSkimSortPersisted: true
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
