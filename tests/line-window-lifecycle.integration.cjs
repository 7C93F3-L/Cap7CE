const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");
const controllerSource = fs.readFileSync(path.join(root, "electron", "lineWindowController.ts"), "utf8");
const appSource = fs.readFileSync(path.join(root, "src", "renderer", "App.tsx"), "utf8");
const lineAppSource = fs.readFileSync(path.join(root, "src", "renderer", "LineWindowApp.tsx"), "utf8");
const lineStyleSource = fs.readFileSync(path.join(root, "src", "renderer", "LineWindowApp.css"), "utf8");
const preloadSource = fs.readFileSync(path.join(root, "electron", "preload.ts"), "utf8");

assert.match(mainSource, /if \(standbyLineVisible\) \{\s*lineWindowController\.create\(\);\s*\}/u);
assert.match(mainSource, /if \(standbyLineVisible\) \{[\s\S]*?lineWindowController\.create\(\);[\s\S]*?\} else \{\s*lineWindowController\.destroy\(\);\s*\}/u);
assert.match(mainSource, /lineWindowController\.ownsWebContents\(event\.sender\.id\)/u);
assert.match(mainSource, /standbyLineVisible[\s\S]*?!mainWindow\.isVisible\(\)[\s\S]*?!previewWindow\.isVisible\(\)/u);
assert.match(mainSource, /if \(mode === "standby"\) \{\s*sendActivateShellModeShortcutToRenderer\(mode\);\s*return;\s*\}/u);
assert.doesNotMatch(mainSource, /if \(mode === "standby"\) \{\s*applyStandaloneLineMode\(\)/u);
assert.match(mainSource, /if \(activeShellState === "capsule"\) \{\s*sendActivateShellModeShortcutToRenderer\("standby"\);\s*\}/u);
assert.match(mainSource, /appTray\.on\("click", \(\) => void activateShellModeShortcut\("normal"\)\)/u);
assert.doesNotMatch(mainSource, /appTray\.on\("double-click"|openNormalFromTray/u);
assert.match(mainSource, /const contentViewActive = Boolean\([\s\S]*?rendererContentViewActive[\s\S]*?setSkimShellThumbnailActivity\(contentViewActive\)/u);
assert.match(mainSource, /const isVisibleAndFocused = \(window: BrowserWindow \| null\)[\s\S]*?window\.isVisible\(\) && window\.isFocused\(\)[\s\S]*?isVisibleAndFocused\(mainWindow\) \|\| isVisibleAndFocused\(previewWindow\)[\s\S]*?setThumbnailOptimizationForegroundActive\(foregroundWindowActive\)/u);
assert.match(mainSource, /if \(preferences\.autoCacheOptimizationEnabled\) \{\s*scheduleDirectoryThumbnailOptimization\(await listDirectories\(\)\);\s*\}/u);

assert.match(appSource, /const dismissTransientInteractionsForStandby = useCallback/u);
for (const resetCall of [
  "setKeywordEditSession(null)",
  "dismissCancellableDialog()",
  "setEditingDirectoryId(null)",
  "setPendingQuickCommandConfirmation(null)"
]) {
  assert.ok(appSource.includes(resetCall), `standby cleanup is missing ${resetCall}`);
}
assert.match(appSource, /isAddingDirectory \|\| isClearingCache \|\| isClearingSkimCache[\s\S]*?isDeletingFiles \|\| isSavingMetadata \|\| keywordSaveInFlightRef\.current[\s\S]*?directoryDeleteInFlightRef\.current[\s\S]*?dismissTransientInteractionsForStandby\(\);[\s\S]*?setShellState\("standby"\)/u);
assert.match(appSource, /if \(mode === "line"\) return void enterStandby\(\)/u);
assert.match(appSource, /const collapseShellToStandby = enterStandby/u);

assert.match(controllerSource, /private lineWindow: BrowserWindow \| null = null/u);
assert.match(controllerSource, /if \(!this\.lineWindow \|\| this\.lineWindow\.isDestroyed\(\)\) \{[\s\S]*?this\.create\(\);\s*return false;/u);
assert.match(controllerSource, /const targetWindow = this\.lineWindow;\s*this\.lineWindow = null;[\s\S]*?targetWindow\.destroy\(\)/u);
assert.match(controllerSource, /if \(this\.options\.shouldShow\(\)\) this\.show\(\)/u);
assert.match(controllerSource, /loadPromise\.then\(\(\) => \{\s*if \(this\.lineWindow === createdWindow && this\.options\.shouldShow\(\)\) this\.show\(\)/u);
assert.doesNotMatch(controllerSource, /show\(\)[\s\S]*?isLoadingMainFrame\(\)[\s\S]*?showInactive\(\)/u);
assert.match(controllerSource, /getPlacement\(this\.lineWindow\.getBounds\(\), this\.edge\)[\s\S]*?line:placementChanged/u);
assert.match(preloadSource, /onPlacementChanged:[\s\S]*?line:placementChanged/u);
assert.match(lineAppSource, /cap-line-window-\$\{edge\}/u);
assert.match(lineStyleSource, /cap-line-window-top[\s\S]*?cap-line-window-bottom[\s\S]*?cap-line-window-left[\s\S]*?cap-line-window-right/u);

console.log(JSON.stringify({
  startupCreationGuardedByPreference: true,
  runtimeDisableDestroysLineRenderer: true,
  runtimeEnableRecreatesLineRenderer: true,
  hiddenMainWindowAllowsImmediateLineReveal: true,
  visibleMainOrPreviewWindowBlocksLineReveal: true,
  completedRuntimeLoadRetriesLineReveal: true,
  transparentLineCanRevealWhileRendererLoads: true,
  lineActivationSenderGuardPreserved: true,
  standbyCancelsTransientInteractions: true,
  activeModalTasksBlockStandby: true,
  standbyShortcutUsesRendererEntry: true,
  trayClickUsesNormalShortcutEntry: true,
  contentViewAndForegroundCacheActivitySeparated: true,
  startupCacheOptimizationDiscoveryRestored: true,
  fourDirectionPlacementForwarded: true,
  horizontalAndVerticalLineStylesPresent: true
}));
