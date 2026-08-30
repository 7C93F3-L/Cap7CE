const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");
const preloadSource = fs.readFileSync(path.join(root, "electron", "preload.ts"), "utf8");
const previewDockedSource = fs.readFileSync(path.join(root, "electron", "previewDockedShell.ts"), "utf8");
const windowLayerSource = fs.readFileSync(path.join(root, "electron", "windowLayerController.ts"), "utf8");
const controllerSource = fs.readFileSync(path.join(root, "electron", "lineWindowController.ts"), "utf8");
const layoutPreferenceSource = fs.readFileSync(path.join(root, "src", "renderer", "settings", "useWindowLayoutPreference.ts"), "utf8");
const appSource = fs.readFileSync(path.join(root, "src", "renderer", "App.tsx"), "utf8");
const previewAppSource = fs.readFileSync(path.join(root, "src", "renderer", "PreviewWindowApp.tsx"), "utf8");

assert.match(
  mainSource,
  /type Cap7CEShellState = "standby" \| "capsule" \| "micro" \| "mini" \| "normal" \| "settings";/u
);
assert.match(mainSource, /windowLayoutManager\.captureBounds\(\{ state, bounds, display:/u);
assert.match(mainSource, /const getShellWindowBounds = \(state: Cap7CEShellState, targetDisplay\?: Electron\.Display, capsuleEdge: "top" \| "bottom" = "bottom"\): Electron\.Rectangle => \{/u);
assert.match(mainSource, /const getEdgeSnappedBounds = \(bounds: Electron\.Rectangle\): Electron\.Rectangle => \{/u);
assert.match(mainSource, /const applyPreviewEdgeSnapAfterMove = \(\) => \{[\s\S]*?const nextBounds = getEdgeSnappedBounds\(currentBounds\);/u);
assert.match(mainSource, /const applyEdgeSnapAfterMove = \(\) => \{[\s\S]*?const nextBounds = getEdgeSnappedBounds\(currentBounds\);/u);
assert.doesNotMatch(mainSource, /edgeSnapEnabled|updateEdgeSnapPreference|preferences:updateEdgeSnap/u);
assert.match(mainSource, /label: edgeCollapseEnabled \? t\("tray\.disableEdgeCollapse"\) : t\("tray\.enableEdgeCollapse"\)/u);
assert.match(mainSource, /void setEdgeCollapseEnabled\(!edgeCollapseEnabled\);/u);
assert.match(mainSource, /webContents\.send\("preferences:edgeCollapseEnabledChanged", edgeCollapseEnabled\)/u);
assert.match(preloadSource, /ipcRenderer\.on\("preferences:edgeCollapseEnabledChanged", listener\)/u);
assert.match(layoutPreferenceSource, /preferences\.onEdgeCollapseEnabledChanged\?\.\(setEdgeCollapseEnabled\)/u);
assert.match(previewDockedSource, /export const previewDockedShell = new PreviewDockedShell\(\);/u);
assert.match(mainSource, /previewDockedShell\.attach\(\{/u);
assert.match(mainSource, /previewDockedShell\.getExpandedBounds\(previewWindow\)/u);
assert.match(mainSource, /previewDockedShell\.applyExpandedBounds\(previewWindow, nextBounds, markPreviewProgrammaticMove\)/u);
assert.match(previewDockedSource, /const previewCollapsibleStates = new Set\(\["preview"\]\)/u);
assert.match(previewDockedSource, /controller\?\.updateExpandedBounds\(bounds\)/u);
assert.match(previewDockedSource, /controller\?\.reconcileDisplayConfiguration\(\)/u);
assert.match(mainSource, /previewDockedShell\.resetSession\(\);[\s\S]*?previewWindow\.hide\(\)/u);
assert.match(mainSource, /previewDockedShell\.toggleFixed\(\);[\s\S]*?applyAlwaysOnTopState\(\)/u);
assert.match(windowLayerSource, /setAlwaysOnTop\(true, "floating"\)/u);
assert.match(windowLayerSource, /setAlwaysOnTop\(true, "screen-saver"\)/u);
assert.match(mainSource, /setCollapsedLayerActive: \(active\) => windowLayerController\.setMainCollapsedLayerActive\(active\)/u);
assert.match(mainSource, /setCollapsedLayerActive: \(active\) => windowLayerController\.setPreviewCollapsedLayerActive\(active\)/u);
assert.match(previewDockedSource, /resetSession\(\) \{[\s\S]*?this\.controller\?\.reset\(false\);[\s\S]*?this\.fixed = false;/u);
assert.match(previewDockedSource, /this\.sessionActive = false;[\s\S]*?this\.controller\?\.setEnabled\(false\);/u);
assert.match(mainSource, /previewSessionActive = true;[\s\S]*?previewDockedShell\.startSession\(\);/u);
assert.match(mainSource, /shellAlwaysOnTop = preferences\.alwaysOnTop;[\s\S]*?dockedShellController\?\.setFixed\(shellAlwaysOnTop\)/u);
assert.match(mainSource, /screen\.on\("display-added", \(\) => scheduleShellWorkAreaRefresh\(null\)\)/u);
assert.match(mainSource, /screen\.on\("display-removed", \(\) => scheduleShellWorkAreaRefresh\(null\)\)/u);
assert.match(mainSource, /changedMetrics\.includes\("scaleFactor"\)/u);
assert.match(appSource, /isAlwaysOnTop \? t\("window\.unfix"\) : t\("window\.fix"\)/u);
assert.doesNotMatch(previewAppSource, /window\.onAlwaysOnTopChanged/u);
assert.match(mainSource, /const nextState = resolveResizeTargetState\(activeShellState, getShellContentBounds\(currentBounds\), getShellContentWorkArea\(currentDisplay\.workArea\)\);/u);
assert.match(mainSource, /if \(!isStableResizeBounds\(shellState, getShellContentBounds\(bounds\), getShellContentWorkArea\(display\.workArea\)\)\) return;/u);
assert.match(mainSource, /const isProgrammaticMoveGuardActive = \(\) => Date\.now\(\) < programmaticMoveGuardUntil;/u);
assert.match(mainSource, /const isProgrammaticResizeGuardActive = \(\) => Date\.now\(\) < programmaticResizeGuardUntil;/u);

assert.match(
  mainSource,
  /const showAndFocusMainWindow = \(\) => \{[\s\S]*?lineWindowController\.hide\(\);[\s\S]*?setShellIgnoreMouseEvents\(false\);[\s\S]*?mainWindow\.show\(\);[\s\S]*?mainWindow\.restore\(\);[\s\S]*?mainWindow\.focus\(\);[\s\S]*?mainWindow\.moveTop\(\);/u
);
assert.match(
  mainSource,
  /const applyStandaloneLineMode = \(\) => \{[\s\S]*?rememberUserMovedShellBounds\(mainWindow\.getBounds\(\)\);[\s\S]*?activeShellState = "standby";[\s\S]*?mainWindow\.hide\(\);[\s\S]*?lineWindowController\.show\(\);/u
);
assert.match(
  mainSource,
  /const applyShellWindowState = \(state: string,[\s\S]*?if \(state === "standby"\) \{[\s\S]*?applyStandaloneLineMode\(\)[\s\S]*?if \(state === "capsule"\) \{[\s\S]*?applyCapsuleWindowMode\(\)/u
);
assert.match(mainSource, /const activateCapsuleShortcut = \(source: "cursor" \| "line" = "cursor"\) => \{[\s\S]*?source === "line" \? getLineWindowPlacement\(\) : null[\s\S]*?screen\.getDisplayMatching\(linePlacement\.bounds\)[\s\S]*?screen\.getDisplayNearestPoint\(screen\.getCursorScreenPoint\(\)\)[\s\S]*?pendingCapsuleTargetDisplayId = targetDisplay\.id[\s\S]*?pendingCapsuleEdge = linePlacement\?\.edge === "top" \? "top" : "bottom"/u);
assert.match(mainSource, /const targetDisplay = screen\.getAllDisplays\(\)\.find\(\(\{ id \}\) => id === pendingCapsuleTargetDisplayId\);[\s\S]*?getShellWindowBounds\("capsule", targetDisplay, capsuleEdge\)/u);
assert.match(mainSource, /const capsuleEdge = pendingCapsuleEdge \?\? "bottom"/u);
assert.match(mainSource, /mainWindow\.on\("will-resize", applyBottomCenterMicroWillResize\);/u);
assert.match(mainSource, /mainWindow\.on\("resize", \(\) => \{[\s\S]*?scheduleResizeSettledCheck\(\);/u);
assert.match(mainSource, /mainWindow\.on\("move", \(\) => \{[\s\S]*?scheduleMoveSnapCheck\(\);/u);

assert.match(controllerSource, /focusable: false/u);
assert.match(controllerSource, /this\.lineWindow\.showInactive\(\);/u);
assert.match(controllerSource, /this\.lineWindow\.setShape\(\[getDirectionalLineShape\(bounds, this\.edge, this\.options\.interactionThickness\)\]\)/u);
assert.match(controllerSource, /this\.lineWindow\.webContents\.send\("line:placementChanged", this\.edge\)/u);

console.log(JSON.stringify({
  shellStatesFrozen: true,
  persistentMovedBoundsIntegrationPresent: true,
  defaultBoundsAndEdgeSnapBaselinePresent: true,
  edgeSnapAlwaysEnabledAndTrayCollapseSynchronized: true,
  mainAndPreviewFixedStateIndependent: true,
  previewCollapseLifecycleAndSizingProtected: true,
  resizeStateInferenceBaselinePresent: true,
  programmaticMoveAndResizeGuardsPresent: true,
  hiddenActivationOrderFrozen: true,
  standaloneLineMutualExclusionFrozen: true,
  resizeAndMoveLifecycleFrozen: true,
  lineWindowNonFocusableAndShaped: true
}));
