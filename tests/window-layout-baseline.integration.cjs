const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const mainSource = read("electron/main.ts");
const preloadSource = read("electron/preload.ts");
const rendererEntrySource = read("src/renderer/main.tsx");
const lineAppSource = read("src/renderer/LineWindowApp.tsx");
const layoutStoreSource = read("electron/windowLayoutStore.ts");
const layoutTypesSource = read("electron/windowLayoutTypes.ts");

for (const removedPath of [
  "electron/capsuleWindowController.ts",
  "electron/capsuleSubmissionHandoff.ts",
  "electron/windowResizeState.ts",
  "electron/shellWindowPresentationSizing.ts",
  "src/renderer/CompatibilityCapsuleWindowApp.tsx",
  "src/renderer/window-presentation/useCompatibilityCapsuleBridge.ts",
  "src/renderer/search/QuickSearchCapsule.tsx"
]) {
  assert.equal(fs.existsSync(path.join(root, removedPath)), false, `${removedPath} should be removed`);
}

assert.doesNotMatch(mainSource, /CapsuleWindowController|CapsuleSubmissionHandoff|applyCapsuleWindowMode|mainWindow\.setIgnoreMouseEvents|resolveResizeTargetState|scheduleResizeSettledCheck|applyBottomCenterMicroWillResize/u);
assert.doesNotMatch(preloadSource, /capsule:|\bcapsule:\s*\{/u);
assert.doesNotMatch(rendererEntrySource, /compatibility-capsule|CompatibilityCapsuleWindowApp/u);
assert.match(mainSource, /const activateMainSearchShortcut = \(\) => \{[\s\S]*?dockedShellController\?\.restore\(false\)[\s\S]*?showAndFocusMainWindow\(\)[\s\S]*?sendFocusMainSearchToRenderer\(\)/u);
assert.match(mainSource, /ipcMain\.handle\("line:activateMain"[\s\S]*?activateMainSearchShortcut\(\)/u);
assert.match(lineAppSource, /line\.activateMain\(\)/u);
assert.match(mainSource, /const applyStandaloneLineMode = \(\) => \{[\s\S]*?rememberUserMovedShellBounds\(mainWindow\.getBounds\(\)\)[\s\S]*?activeShellState = "standby"[\s\S]*?mainWindow\.hide\(\)[\s\S]*?lineWindowController\.show\(\)/u);
assert.match(mainSource, /mainWindow\.on\("resize"[\s\S]*?scheduleMoveSettledCheck\(\)/u);
assert.match(layoutTypesSource, /PersistedWindowLayoutState = "normal"/u);
assert.match(layoutStoreSource, /layoutStates: PersistedWindowLayoutState\[\] = \["normal"\]/u);

console.log(JSON.stringify({
  compatibilityCapsuleRemoved: true,
  sameWindowCapsuleRemoved: true,
  legacyResizeStatesRemoved: true,
  lineUsesUnifiedMainActivation: true,
  stableLayoutMemoryOnly: true
}));
