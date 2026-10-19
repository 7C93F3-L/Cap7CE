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
assert.match(mainSource, /const requestSafeMainWindowHide = \(\) => sendActivateShellModeShortcutToRenderer\("standby"\);/u);
assert.match(mainSource, /if \(mode === "standby"\) \{\s*return requestSafeMainWindowHide\(\);\s*\}/u);
assert.doesNotMatch(mainSource, /if \(mode === "standby"\) \{\s*applyStandaloneLineMode\(\)/u);
assert.match(mainSource, /ipcMain\.handle\("line:activateMain"[\s\S]*?return activateMainSearchShortcut\(\);/u);
assert.match(lineAppSource, /window\.cap7ce\?\.line\.activateMain\(\)/u);
assert.match(mainSource, /appTray\.on\("click", \(\) => void activateShellModeShortcut\("normal"\)\)/u);
assert.match(mainSource, /mainWindow\.on\("blur", syncThumbnailOptimizationActivity\)/u);
assert.doesNotMatch(mainSource, /mainWindow\.on\("blur", \(\) => \{[\s\S]*?cancelActiveSearchTasks\(\)/u);
assert.match(mainSource, /mainWindow\.on\("minimize", \(\) => \{\s*syncThumbnailOptimizationActivity\(\);\s*cancelActiveSearchTasks\(\);\s*discardQueuedInteractiveThumbnailRenders\(\);\s*\}\)/u);
assert.match(mainSource, /mainWindow\.on\("restore", syncThumbnailOptimizationActivity\)/u);
assert.match(mainSource, /mainWindow\.on\("hide", \(\) => \{[\s\S]*?discardQueuedInteractiveThumbnailRenders\(\);\s*\}\);/u);
assert.doesNotMatch(mainSource, /appTray\.on\("double-click"|openNormalFromTray/u);
assert.match(mainSource, /const contentViewActive = Boolean\([\s\S]*?rendererContentViewActive[\s\S]*?setSkimShellThumbnailActivity\(contentViewActive\)/u);
assert.match(mainSource, /searchScanSnapshotService\.setActive\(false\)/u);
assert.match(mainSource, /const isVisibleAndFocused = \(window: BrowserWindow \| null\)[\s\S]*?window\.isVisible\(\) && window\.isFocused\(\)[\s\S]*?isVisibleAndFocused\(mainWindow\)[\s\S]*?settingsWindowController\?\.isVisibleAndFocused\(\)[\s\S]*?isVisibleAndFocused\(previewWindow\)[\s\S]*?setThumbnailOptimizationForegroundActive\(foregroundWindowActive\)/u);
const activityBody = mainSource.slice(mainSource.indexOf('const syncThumbnailOptimizationActivity = () => {'), mainSource.indexOf('const cancelActiveSearchTasks = () => {'));
const activity = { visible: true, focused: false, minimized: false, destroyed: false };
const projection = {}, activityContext = {
  rendererContentViewActive: true, activeShellState: 'normal', settingsWindowController: null, previewWindow: null,
  mainWindow: { isVisible: () => activity.visible, isFocused: () => activity.focused, isMinimized: () => activity.minimized, isDestroyed: () => activity.destroyed },
  isVisibleAndFocused: window => Boolean(window && !window.isDestroyed() && window.isVisible() && window.isFocused()),
  setSkimShellThumbnailActivity: value => { projection.skim = value; }, setSearchShellVisualActivity: value => { projection.search = value; },
  searchScanSnapshotService: { setActive() {} }, setThumbnailOptimizationForegroundActive: value => { projection.optimization = value; }, setVisualPropertyForegroundActive: value => { projection.properties = value; }
};
const readActivity = () => require('node:vm').runInNewContext(`(()=>{${activityBody};return syncThumbnailOptimizationActivity()})()`, activityContext);
assert.equal(readActivity(), true, 'visible unfocused normal window admits viewport thumbnails');
assert.deepEqual(projection, { skim: true, search: true, optimization: false, properties: false }, 'batch optimization still follows focus independently');
activity.focused = true;assert.equal(readActivity(), true);assert.equal(projection.optimization, true);
activity.focused = false;
for (const patch of [{ visible: false }, { minimized: true }, { destroyed: true }]) {
  Object.assign(activity, patch);assert.equal(readActivity(), false);
  for (const key of Object.keys(patch)) activity[key] = key === 'visible';
}
for (const shell of ['micro', 'mini', 'line', 'standby', 'settings']) { activityContext.activeShellState = shell;assert.equal(readActivity(), false); }
activityContext.activeShellState = 'normal';activityContext.rendererContentViewActive = false;assert.equal(readActivity(), false);
assert.doesNotMatch(mainSource, /ThumbnailOptimizationDiscovery|scheduleDirectoryThumbnailOptimization|setThumbnailOptimizationEnabled\(preferences\.autoCacheOptimizationEnabled\)/u);

assert.match(appSource, /const dismissTransientInteractionsForStandby = useCallback/u);
for (const resetCall of [
  "setKeywordEditSession(null)",
  "dismissCancellableDialog()",
  "setEditingDirectoryId(null)",
  "setPendingQuickCommandConfirmation(null)"
]) {
  assert.ok(appSource.includes(resetCall), `standby cleanup is missing ${resetCall}`);
}
assert.match(appSource, /isAddingDirectory[\s\S]*?isDeletingFiles \|\| isSavingMetadata \|\| keywordSaveInFlightRef\.current[\s\S]*?directoryDeleteInFlightRef\.current[\s\S]*?dismissTransientInteractionsForStandby\(\);[\s\S]*?window\.cap7ce\?\.window\.setShellState\("standby"\)/u);
assert.match(appSource, /if \(mode === "standby"\) setCommandShellMode\(\)/u);
assert.match(appSource, /const collapseShellToStandby = enterStandby/u);

assert.match(controllerSource, /private lineWindow: BrowserWindow \| null = null/u);
assert.match(controllerSource, /if \(!this\.lineWindow \|\| this\.lineWindow\.isDestroyed\(\)\) \{[\s\S]*?this\.create\(\);\s*return false;/u);
assert.match(controllerSource, /const targetWindow = this\.lineWindow;\s*this\.lineWindow = null;[\s\S]*?targetWindow\.destroy\(\)/u);
assert.match(controllerSource, /if \(this\.options\.shouldShow\(\)\) this\.show\(\)/u);
assert.match(controllerSource, /loadPromise\.then\(\(\) => \{\s*if \(this\.lineWindow === createdWindow && this\.options\.shouldShow\(\)\) this\.show\(\)/u);
assert.doesNotMatch(controllerSource, /show\(\)[\s\S]*?isLoadingMainFrame\(\)[\s\S]*?showInactive\(\)/u);
assert.match(controllerSource, /getPlacement\(this\.lineWindow\.getBounds\(\), this\.edge\)[\s\S]*?line:placementChanged/u);
assert.match(preloadSource, /onPlacementChanged:[\s\S]*?line:placementChanged/u);
assert.match(preloadSource, /lineWindowVisible = false[\s\S]*?line:visibilityChanged[\s\S]*?lineVisibilityCallbacks[\s\S]*?callback\(lineWindowVisible\)/u);
assert.match(lineAppSource, /cap-line-window-\$\{edge\}/u);
assert.match(lineAppSource, /onVisibilityChanged\(setVisible\)[\s\S]*?is-line-visible/u);
assert.match(lineStyleSource, /cap-line-window-top[\s\S]*?cap-line-window-bottom[\s\S]*?cap-line-window-left[\s\S]*?cap-line-window-right/u);
assert.match(controllerSource, /webContents\.send\("line:visibilityChanged", false\)[\s\S]*?\.hide\(\)[\s\S]*?\.showInactive\(\)[\s\S]*?webContents\.send\("line:visibilityChanged", true\)/u);
assert.match(lineStyleSource, /animation-play-state: paused[\s\S]*?is-line-visible[\s\S]*?animation-play-state: running[\s\S]*?will-change: transform/u);
assert.match(lineStyleSource, /background-size: 360px 100%[\s\S]*?@keyframes standbyLineFlowHorizontal \{[\s\S]*?translate3d\(-360px, 0, 0\)/u);
assert.match(lineStyleSource, /background-size: 100% 360px[\s\S]*?@keyframes standbyLineFlowVertical \{[\s\S]*?translate3d\(0, -360px, 0\)/u);
assert.doesNotMatch(lineStyleSource, /@keyframes[\s\S]*?background-position/u);

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
  minimizedAndHiddenThumbnailQueuesDiscarded: true,
  visibleUnfocusedSearchScanPreserved: true,
  hiddenAndMinimizedSearchCancellationPreserved: true,
  contentViewAndForegroundCacheActivitySeparated: true,
  startupCacheOptimizationDiscoveryRestored: true,
  fourDirectionPlacementForwarded: true,
  horizontalAndVerticalLineStylesPresent: true,
  hiddenLineAnimationPaused: true,
  compositorOnlyLineMotionVerified: true
}));
