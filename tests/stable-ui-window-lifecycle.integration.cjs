const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const {
  STABLE_UI_TITLEBAR_HEIGHT,
  applyStableUiWindowMaterial,
  isStableUiLegacySizeShortcut,
  resolveStableUiBrowserOptions,
  resolveStableUiDefaultWindowBounds
} = require("../dist-electron/stableUiWindowLifecycle.js");

assert.equal(STABLE_UI_TITLEBAR_HEIGHT, 40);
assert.deepEqual(resolveStableUiDefaultWindowBounds({ x: 0, y: 0, width: 1920, height: 1040 }), { x: 320, y: 120, width: 1280, height: 800 });
assert.deepEqual(resolveStableUiDefaultWindowBounds({ x: 1920, y: 0, width: 1366, height: 728 }), { x: 1989, y: 37, width: 1229, height: 655 });

const browserOptions = resolveStableUiBrowserOptions({
  frame: false,
  transparent: false,
  backgroundColor: "#00000000",
  backgroundMaterial: "mica",
  titleBarStyle: "hidden",
  titleBarOverlay: { color: "#00000000", symbolColor: "#242424", height: 36 }
}, true);
assert.equal(browserOptions.frame, true);
assert.equal(browserOptions.transparent, false);
assert.equal(browserOptions.backgroundMaterial, undefined);
assert.equal(browserOptions.titleBarOverlay.height, 40);
assert.equal(isStableUiLegacySizeShortcut("activateMicro"), true);
assert.equal(isStableUiLegacySizeShortcut("activateMini"), true);
assert.equal(isStableUiLegacySizeShortcut("activateNormal"), false);

const acrylicCalls = [];
assert.equal(applyStableUiWindowMaterial({
  setBackgroundMaterial: (material) => acrylicCalls.push(["material", material]),
  setBackgroundColor: (color) => acrylicCalls.push(["color", color])
}, true, "light"), "acrylic");
assert.deepEqual(acrylicCalls, [["material", "acrylic"], ["color", "#00000000"]]);

const fallbackCalls = [];
assert.equal(applyStableUiWindowMaterial({
  setBackgroundMaterial: (material) => { fallbackCalls.push(["material", material]); if (material === "acrylic") throw new Error("unsupported"); },
  setBackgroundColor: (color) => fallbackCalls.push(["color", color])
}, true, "dark"), "solid");
assert.deepEqual(fallbackCalls, [["material", "acrylic"], ["material", "none"], ["color", "#202020"]]);

const mainSource = read("electron/main.ts");
const runtimeSource = read("electron/windowPresentationRuntime.ts");
const settingsSource = read("src/renderer/settings-window/SettingsWindowApp.tsx");
const quickActionsSource = read("src/renderer/settings/QuickActionSettingsRows.tsx");
const hintSource = read("src/renderer/controllers/useOperationHintController.ts");
const foundationStyles = read("src/renderer/stable-ui/StableUiFoundation.css");
const stableTitlebarSource = read("src/renderer/stable-ui/StableTitlebar.tsx");
const titlebarPortalSource = read("src/renderer/window-presentation/WindowTitlebarPortal.tsx");
const settingsStyles = read("src/renderer/settings-window/SettingsWindowApp.css");
const previewStyles = read("src/renderer/preview/StablePreviewShell.css");

assert.match(runtimeSource, /resolveStableUiBrowserOptions/u);
assert.match(runtimeSource, /applyStableUiWindowMaterial/u);
assert.match(mainSource, /getNormalDefaultOuterBounds:[^\n]*resolveStableUiDefaultWindowBounds/u);
assert.match(mainSource, /const revealPreviewWindow = \(\) => \{[\s\S]*?!isCurrentStableUiDevelopmentEnabled\(windowPresentationRuntime\.mode\)[\s\S]*?mainWindow\.hide\(\)/u);
assert.match(mainSource, /wasActive && restoreMain && !isCurrentStableUiDevelopmentEnabled/u);
assert.match(mainSource, /preview:toggleSkimLocationPicker[\s\S]*?closePreviewSession\(\);[\s\S]*?showAndFocusMainWindow\(\);[\s\S]*?sendToggleSkimLocationPickerToRenderer/u);
assert.match(mainSource, /preview:itemAction[\s\S]*?closePreviewSession\(\);[\s\S]*?showAndFocusMainWindow\(\);[\s\S]*?mainWindow\.webContents\.send/u);
assert.match(mainSource, /isStableUiLegacySizeShortcut\(id\)\) continue/u);
assert.match(mainSource, /activateShellModeShortcut\(mode, mode === "normal"\)/u);
assert.match(mainSource, /applyDefaultSizePreset[\s\S]*?resolveStableUiDefaultWindowBounds/u);
assert.match(mainSource, /const activateCapsuleShortcut[\s\S]*?isCurrentStableUiDevelopmentEnabled[\s\S]*?sendActivateCapsuleShortcutToRenderer/u);
assert.match(mainSource, /const shouldWaitForTargetLayout = !isCurrentStableUiDevelopmentEnabled[\s\S]*?!mainWindow\.isVisible/u);
assert.match(settingsSource, /<QuickActionSettingsRows stableUi/u);
assert.match(quickActionsSource, /item\.id !== "activateMicro" && item\.id !== "activateMini"/u);
assert.match(hintSource, /stableUi && \(hint\.shortcutActionId === "activateMicro" \|\| hint\.shortcutActionId === "activateMini"\)/u);
assert.match(foundationStyles, /env\(titlebar-area-height, 40px\)/u);
assert.match(foundationStyles, /\.cap-stable-titlebar\s*\{[\s\S]*?z-index:\s*60/u);
assert.match(stableTitlebarSource, /<WindowTitlebarPortal>[\s\S]*?<header/u);
assert.match(titlebarPortalSource, /createPortal\(children, document\.body\)/u);
assert.match(settingsStyles, /cap-settings-window-drag-region[\s\S]*?height: 40px/u);
assert.match(previewStyles, /preview-window-stable-ui \{ --compatibility-titlebar-height: 40px; background: transparent; \}/u);

console.log(JSON.stringify({
  acrylicWithSolidFallbackVerified: true,
  fortyDipWindowControlsOverlayVerified: true,
  scrollingCannotReparentNativeDragRegion: true,
  responsiveInitialBoundsVerified: true,
  freeWindowLayoutProfileVerified: true,
  legacySizeShortcutsSuppressedInStableUi: true,
  defaultSizeShortcutIsOneShot: true,
  capsuleReplacedByMainSearchFocus: true,
  mainSettingsPreviewCoexistenceVerified: true,
  legacyWindowPathsPreserved: true
}));
