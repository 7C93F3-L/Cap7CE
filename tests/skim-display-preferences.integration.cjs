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
      updateStableShortcutActionsPreference,
      updateSkimDisplayPreference,
      updateSkimSidebarFoldersPreference,
      updateSkimSystemLocationsCollapsedPreference,
      updateSkimSortPreference,
      updateEdgeCollapsePreference,
      updateUiFontSizePreference,
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
    assert.equal("shortcutActions" in defaults, false);
    assert.deepEqual({
      open: defaults.stableShortcutActions.focusMainSearch,
      hide: defaults.stableShortcutActions.hideToLine,
      skim: defaults.stableShortcutActions.toggleSkim,
      settings: defaults.stableShortcutActions.openSettings,
      reset: defaults.stableShortcutActions.restoreDefaultWindow,
      directory: defaults.stableShortcutActions.cycleDirectory
    }, { open: "Alt+`", hide: "Alt+1", skim: "Alt+2", settings: "Alt+4", reset: "Alt+3", directory: "Alt+Q" });
    assert.equal(defaults.edgeCollapseEnabled, false);
    assert.equal("rememberWindowLayout" in defaults, false);
    assert.equal("windowPresentationMode" in defaults, false);
    assert.equal(defaults.uiFontSize, 13);
    assert.deepEqual(defaults.sortPreference, {
      sortField: "modified_at",
      sortDirection: "desc"
    });
    assert.deepEqual(defaults.skimSortPreference, {
      sortField: "file_name",
      sortDirection: "asc"
    });

    const preferencesPath = path.join(app.getPath("userData"), "config", "preferences.json");
    await fs.mkdir(path.dirname(preferencesPath), { recursive: true });
    await fs.writeFile(preferencesPath, JSON.stringify({
      stableShortcutActions: {
        focusMainSearch: "Alt+`",
        restoreDefaultWindow: "Alt+4",
        hideToLine: "Alt+1",
        toggleSkim: "Alt+2",
        cycleDirectory: "Alt+Q",
        openSettings: "Alt+3"
      }
    }));
    const refreshedDefaults = await getUserPreferences();
    assert.equal(refreshedDefaults.stableShortcutActions.restoreDefaultWindow, "Alt+3");
    assert.equal(refreshedDefaults.stableShortcutActions.openSettings, "Alt+4");

    const legacyPreferencesPath = preferencesPath;
    await fs.mkdir(path.dirname(legacyPreferencesPath), { recursive: true });
    const sidebarFolder = path.join(testRoot, "Sidebar Folder");
    await fs.writeFile(legacyPreferencesPath, JSON.stringify({
      edgeSnapEnabled: false,
      rememberWindowLayout: false,
      windowPresentationMode: "compatibility",
      uiFontSize: 99,
      skimDisplay: {
        mode: "all",
        customExtensions: [".png"],
        showHiddenFiles: false
      },
      skimSidebarFolders: [sidebarFolder, sidebarFolder.toUpperCase(), app.getPath("desktop"), app.getPath("downloads"), path.parse(sidebarFolder).root, "", 42],
      stableShortcutActions: {
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
    assert.equal("shortcutActions" in migrated, false);
    assert.deepEqual(migrated.stableShortcutActions, {
      focusMainSearch: "Alt+`",
      restoreDefaultWindow: "Alt+3",
      hideToLine: "Alt+4",
      toggleSkim: "Alt+5",
      cycleDirectory: "Alt+Q",
      openSettings: "Alt+6"
    });
    assert.equal("activateMicro" in migrated.stableShortcutActions, false);
    assert.equal("activateMini" in migrated.stableShortcutActions, false);
    assert.deepEqual(migrated.skimSidebarFolders, [sidebarFolder]);
    assert.equal(migrated.skimSystemLocationsCollapsed, false);
    assert.equal(migrated.edgeCollapseEnabled, false);
    assert.equal("edgeSnapEnabled" in migrated, false);
    assert.equal("rememberWindowLayout" in migrated, false);
    assert.equal("windowPresentationMode" in migrated, false);
    assert.equal(migrated.uiFontSize, 13);

    const updatedStableShortcuts = await updateStableShortcutActionsPreference({
      ...migrated.stableShortcutActions,
      cycleDirectory: "Alt+E"
    });
    assert.equal(updatedStableShortcuts.stableShortcutActions.cycleDirectory, "Alt+E");

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
    await updateUiFontSizePreference(16);
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
    assert.equal("rememberWindowLayout" in reloaded, false);
    assert.equal("windowPresentationMode" in reloaded, false);
    assert.equal(reloaded.uiFontSize, 16);

    console.log(JSON.stringify({
      defaultSkimModeSeeded: true,
      legacySkimPreferencesMigrated: true,
      directoryCycleShortcutPersisted: true,
      customExtensionsNormalized: true,
      skimModePersisted: true,
      independentSearchModePersisted: true,
      skimLabelVisibilityPersisted: true,
      independentSkimSortPersisted: true,
      skimSidebarFoldersNormalizedAndPersisted: true,
      skimSystemLocationsCollapsedPersisted: true,
      edgeCollapsePreferencePersisted: true,
      retiredWindowPreferencesIgnored: true,
      uiFontSizePersisted: true
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
