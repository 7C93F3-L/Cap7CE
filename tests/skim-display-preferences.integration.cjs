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
    }, { open: "Alt+`", hide: "Alt+1", skim: "Alt+3", settings: "Alt+4", reset: "Alt+2", directory: "Alt+Q" });
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
    assert.equal(refreshedDefaults.stableShortcutActions.restoreDefaultWindow, "Alt+4");
    assert.equal(refreshedDefaults.stableShortcutActions.openSettings, "Alt+3");

    const sidebarFolder = path.join(testRoot, "Sidebar Folder");
    await fs.writeFile(preferencesPath, JSON.stringify({
      uiFontSize: 99,
      skimDisplay: {
        mode: "all",
        customExtensions: [".png"],
        showHiddenFiles: false
      },
      skimSidebarFolders: [sidebarFolder, sidebarFolder.toUpperCase(), app.getPath("desktop"), app.getPath("downloads"), path.parse(sidebarFolder).root, "", 42],
      stableShortcutActions: {
        focusMainSearch: "Alt+`",
        restoreDefaultWindow: "Alt+3",
        hideToLine: "Alt+4",
        toggleSkim: "Alt+5",
        cycleDirectory: "Alt+Q",
        openSettings: "Alt+6"
      }
    }));
    const normalized = await getUserPreferences();
    assert.equal(normalized.skimDisplay.mode, "all");
    assert.equal(normalized.skimDisplay.searchMode, "skim");
    assert.deepEqual(normalized.stableShortcutActions, {
      focusMainSearch: "Alt+`",
      restoreDefaultWindow: "Alt+3",
      hideToLine: "Alt+4",
      toggleSkim: "Alt+5",
      cycleDirectory: "Alt+Q",
      openSettings: "Alt+6"
    });
    assert.deepEqual(normalized.skimSidebarFolders, [sidebarFolder]);
    assert.equal(normalized.skimSystemLocationsCollapsed, false);
    assert.equal(normalized.edgeCollapseEnabled, false);
    assert.equal(normalized.uiFontSize, 13);

    const updatedStableShortcuts = await updateStableShortcutActionsPreference({
      ...normalized.stableShortcutActions,
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
    assert.equal(reloaded.uiFontSize, 16);

    console.log(JSON.stringify({
      defaultSkimModeSeeded: true,
      skimPreferencesNormalized: true,
      directoryCycleShortcutPersisted: true,
      customExtensionsNormalized: true,
      skimModePersisted: true,
      independentSearchModePersisted: true,
      skimLabelVisibilityPersisted: true,
      independentSkimSortPersisted: true,
      skimSidebarFoldersNormalizedAndPersisted: true,
      skimSystemLocationsCollapsedPersisted: true,
      edgeCollapsePreferencePersisted: true,
      invalidUiFontSizeRejected: true,
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
