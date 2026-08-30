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
      updateShortcutActionsPreference,
      updateSkimDisplayPreference,
      updateSkimSidebarFoldersPreference,
      updateSkimSystemLocationsCollapsedPreference,
      updateSkimSortPreference,
      updateEdgeCollapsePreference,
      updateRememberWindowLayoutPreference,
      updateWindowPresentationModePreference,
      updateSortPreference
    } = require("../dist-electron/preferenceStore.js");

    const defaults = await getUserPreferences();
    assert.equal(defaults.skimDisplay.mode, "skim");
    assert.equal(defaults.skimDisplay.searchMode, "skim");
    assert.equal(defaults.skimDisplay.showHiddenFiles, false);
    assert.equal(defaults.skimDisplay.customExtensions.includes(".png"), true);
    assert.equal(defaults.searchLabelVisibility.skimDisplay, true);
    assert.equal(defaults.searchLabelVisibility.ai, true);
    assert.deepEqual(defaults.skimSidebarFolders, []);
    assert.equal(defaults.skimSystemLocationsCollapsed, false);
    assert.equal(defaults.shortcutActions.cycleDirectory, "Alt+Q");
    assert.equal(defaults.edgeCollapseEnabled, false);
    assert.equal(defaults.rememberWindowLayout, false);
    assert.equal(defaults.windowPresentationMode, "cap7ce");
    assert.deepEqual(defaults.sortPreference, {
      sortField: "modified_at",
      sortDirection: "desc"
    });
    assert.deepEqual(defaults.skimSortPreference, {
      sortField: "file_name",
      sortDirection: "asc"
    });

    const legacyPreferencesPath = path.join(app.getPath("userData"), "config", "preferences.json");
    await fs.mkdir(path.dirname(legacyPreferencesPath), { recursive: true });
    const sidebarFolder = path.join(testRoot, "Sidebar Folder");
    await fs.writeFile(legacyPreferencesPath, JSON.stringify({
      edgeSnapEnabled: false,
      skimDisplay: {
        mode: "all",
        customExtensions: [".png"],
        showHiddenFiles: false
      },
      skimSidebarFolders: [sidebarFolder, sidebarFolder.toUpperCase(), app.getPath("desktop"), app.getPath("downloads"), path.parse(sidebarFolder).root, "", 42],
      shortcutActions: {
        activateCapsule: "Alt+`",
        activateMicro: "Alt+1",
        activateMini: "Alt+2",
        activateNormal: "Alt+3",
        activateStandby: "Alt+4",
        activateSkim: "Alt+5",
        openSettings: "Alt+6"
      }
    }));
    const migrated = await getUserPreferences();
    assert.equal(migrated.skimDisplay.mode, "all");
    assert.equal(migrated.skimDisplay.searchMode, "skim");
    assert.equal(migrated.shortcutActions.cycleDirectory, "Alt+Q");
    assert.deepEqual(migrated.skimSidebarFolders, [sidebarFolder]);
    assert.equal(migrated.skimSystemLocationsCollapsed, false);
    assert.equal(migrated.edgeCollapseEnabled, false);
    assert.equal("edgeSnapEnabled" in migrated, false);
    assert.equal(migrated.rememberWindowLayout, false);
    assert.equal(migrated.windowPresentationMode, "cap7ce");

    const updatedShortcuts = await updateShortcutActionsPreference({
      ...migrated.shortcutActions,
      cycleDirectory: "Alt+W"
    });
    assert.equal(updatedShortcuts.shortcutActions.cycleDirectory, "Alt+W");

    const updated = await updateSkimDisplayPreference({
      mode: "custom",
      searchMode: "all",
      customExtensions: [".PNG", ".txt", ".txt", "invalid"],
      showHiddenFiles: true
    });
    assert.deepEqual(updated.skimDisplay, {
      mode: "custom",
      searchMode: "all",
      customExtensions: [".png", ".txt"],
      showHiddenFiles: true
    });

    await updateSearchLabelVisibilityPreference({
      ...updated.searchLabelVisibility,
      skimDisplay: false
    });
    await updateSortPreference({ sortField: "modified_at", sortDirection: "desc" });
    await updateSkimSortPreference({ sortField: "file_name", sortDirection: "desc" });
    const secondSidebarFolder = path.join(testRoot, "Second Sidebar Folder");
    await updateSkimSidebarFoldersPreference([sidebarFolder, secondSidebarFolder, sidebarFolder]);
    await updateSkimSystemLocationsCollapsedPreference(true);
    await updateEdgeCollapsePreference(true);
    await updateRememberWindowLayoutPreference(true);
    const invalidMode = await updateWindowPresentationModePreference("invalid");
    assert.equal(invalidMode.windowPresentationMode, "cap7ce");
    await updateWindowPresentationModePreference("compatibility");
    const reloaded = await getUserPreferences();
    assert.equal(reloaded.skimDisplay.mode, "custom");
    assert.equal(reloaded.skimDisplay.searchMode, "all");
    assert.equal(reloaded.searchLabelVisibility.skimDisplay, false);
    assert.equal(reloaded.searchLabelVisibility.ai, true);
    assert.deepEqual(reloaded.sortPreference, { sortField: "modified_at", sortDirection: "desc" });
    assert.deepEqual(reloaded.skimSortPreference, { sortField: "file_name", sortDirection: "desc" });
    assert.deepEqual(reloaded.skimSidebarFolders, [sidebarFolder, secondSidebarFolder]);
    assert.equal(reloaded.skimSystemLocationsCollapsed, true);
    assert.equal(reloaded.edgeCollapseEnabled, true);
    assert.equal(reloaded.rememberWindowLayout, true);
    assert.equal(reloaded.windowPresentationMode, "compatibility");

    console.log(JSON.stringify({
      defaultSkimModeSeeded: true,
      legacySkimPreferencesMigrated: true,
      legacyDirectoryCycleShortcutMigrated: true,
      directoryCycleShortcutPersisted: true,
      customExtensionsNormalized: true,
      skimModePersisted: true,
      independentSearchModePersisted: true,
      skimLabelVisibilityPersisted: true,
      independentSkimSortPersisted: true,
      skimSidebarFoldersNormalizedAndPersisted: true,
      skimSystemLocationsCollapsedPersisted: true,
      edgeCollapsePreferencePersisted: true,
      windowLayoutMemoryPreferencesPersisted: true,
      windowPresentationModePersisted: true
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
