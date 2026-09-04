const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const {
  STABLE_UI_TITLEBAR_HEIGHT,
  STABLE_UI_MINIMUM_OUTER_SIZE,
  applyStableUiWindowMaterial,
  isStableUiLegacySizeShortcut,
  resolveStableUiBrowserOptions,
  resolveStableUiDefaultWindowBounds,
  resolveWindowLayoutMemoryEnabled
} = require("../dist-electron/stableUiWindowLifecycle.js");

assert.equal(STABLE_UI_TITLEBAR_HEIGHT, 40);
assert.deepEqual(STABLE_UI_MINIMUM_OUTER_SIZE, { width: 300, height: 170 });
assert.deepEqual(resolveStableUiDefaultWindowBounds({ x: 0, y: 0, width: 1920, height: 1040 }), { x: 96, y: 52, width: 1728, height: 936 });
assert.deepEqual(resolveStableUiDefaultWindowBounds({ x: 1920, y: 0, width: 1366, height: 728 }), { x: 1989, y: 37, width: 1229, height: 655 });
assert.equal(resolveWindowLayoutMemoryEnabled(false, true), true);
assert.equal(resolveWindowLayoutMemoryEnabled(false, false), false);
assert.equal(resolveWindowLayoutMemoryEnabled(true, false), true);

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

const micaCalls = [];
assert.equal(applyStableUiWindowMaterial({
  setBackgroundMaterial: (material) => micaCalls.push(["material", material]),
  setBackgroundColor: (color) => micaCalls.push(["color", color])
}, true, "light", "mica"), "mica");
assert.deepEqual(micaCalls, [["material", "mica"], ["color", "#00000000"]]);

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
const stablePreviewTitlebarSource = read("src/renderer/preview/StablePreviewTitlebar.tsx");
const titlebarPortalSource = read("src/renderer/window-presentation/WindowTitlebarPortal.tsx");
const settingsStyles = read("src/renderer/settings-window/SettingsWindowApp.css");
const previewTitlebarStyles = read("src/renderer/preview/StablePreviewTitlebar.css");

assert.match(runtimeSource, /resolveStableUiBrowserOptions/u);
assert.match(runtimeSource, /applyStableUiWindowMaterial/u);
assert.match(runtimeSource, /setMaterialPreference\(materialPreference:[\s\S]*?this\.materialPreference = materialPreference/u);
assert.match(mainSource, /refreshWindowPresentationAppearance[\s\S]*?setMaterialPreference\(preferences\.windowMaterial\)[\s\S]*?applyMainWindowAppearance[\s\S]*?applyPreviewWindowAppearance[\s\S]*?applySettingsWindowAppearance/u);
assert.match(mainSource, /getNormalDefaultOuterBounds:[^\n]*resolveStableUiDefaultWindowBounds/u);
assert.match(mainSource, /windowLayoutManager\.setPreferences\(\{ rememberWindowLayout: resolveWindowLayoutMemoryEnabled\(preferences\.rememberWindowLayout, isStableWindowPresentationMode\(windowPresentationRuntime\.mode\)\) \}\)/u);
assert.match(mainSource, /isStableWindowPresentationMode\(windowPresentationRuntime\.mode\)\) return \{ \.\.\.STABLE_UI_MINIMUM_OUTER_SIZE \}/u);
assert.match(mainSource, /const revealPreviewWindow = \(\) => \{[\s\S]*?!isStableWindowPresentationMode\(windowPresentationRuntime\.mode\)[\s\S]*?mainWindow\.hide\(\)/u);
assert.match(mainSource, /if \(wasActive && restoreMain\) \{[\s\S]*?if \(!isStableWindowPresentationMode[\s\S]*?mainWindow\.show\(\);[\s\S]*?\}[\s\S]*?mainWindow\.focus\(\);/u);
assert.match(mainSource, /preview:toggleSkimLocationPicker[\s\S]*?closePreviewSession\(\);[\s\S]*?showAndFocusMainWindow\(\);[\s\S]*?sendToggleSkimLocationPickerToRenderer/u);
assert.match(mainSource, /preview:itemAction[\s\S]*?closePreviewSession\(\);[\s\S]*?showAndFocusMainWindow\(\);[\s\S]*?mainWindow\.webContents\.send/u);
assert.match(mainSource, /isStableUiLegacySizeShortcut\(id\)\) continue/u);
assert.match(mainSource, /activateShellModeShortcut\(mode, mode === "normal"\)/u);
assert.match(mainSource, /applyDefaultSizePreset[\s\S]*?resolveStableUiDefaultWindowBounds/u);
assert.match(mainSource, /const activateCapsuleShortcut[\s\S]*?isStableWindowPresentationMode[\s\S]*?sendActivateCapsuleShortcutToRenderer/u);
assert.match(mainSource, /const shouldWaitForTargetLayout = !isStableWindowPresentationMode[\s\S]*?!mainWindow\.isVisible/u);
assert.match(settingsSource, /<QuickActionSettingsRows stableUi/u);
assert.match(quickActionsSource, /item\.id !== "activateMicro" && item\.id !== "activateMini"/u);
assert.match(hintSource, /stableUi && \(hint\.shortcutActionId === "activateMicro" \|\| hint\.shortcutActionId === "activateMini"\)/u);
assert.match(foundationStyles, /env\(titlebar-area-height, 40px\)/u);
assert.match(foundationStyles, /\.cap-stable-titlebar\s*\{[\s\S]*?z-index:\s*60/u);
assert.match(stableTitlebarSource, /<WindowTitlebarPortal>[\s\S]*?<header/u);
assert.match(stablePreviewTitlebarSource, /<WindowTitlebarPortal>[\s\S]*?<header/u);
assert.match(titlebarPortalSource, /createPortal\(children, document\.body\)/u);
assert.match(settingsStyles, /cap-settings-window-drag-region[\s\S]*?height: 40px/u);
assert.match(previewTitlebarStyles, /preview-window-stable-ui\s*\{[\s\S]*?--compatibility-titlebar-height: 40px;[\s\S]*?border: 0;[\s\S]*?border-radius: 0;[\s\S]*?background: transparent;/u);

console.log(JSON.stringify({
  selectableMaterialWithSolidFallbackVerified: true,
  fortyDipWindowControlsOverlayVerified: true,
  scrollingCannotReparentNativeDragRegion: true,
  responsiveInitialBoundsVerified: true,
  stableMinimumOuterSizeVerified: true,
  freeWindowLayoutProfileVerified: true,
  legacySizeShortcutsSuppressedInStableUi: true,
  defaultSizeShortcutIsOneShot: true,
  capsuleReplacedByMainSearchFocus: true,
  mainSettingsPreviewCoexistenceVerified: true,
  previewCloseFocusReturnVerified: true,
  legacyWindowPathsPreserved: true
}));
