const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const {
  STABLE_UI_DEFAULT_MAXIMUM_OUTER_SIZE,
  STABLE_UI_LAYOUT_FILE_NAME,
  STABLE_UI_MINIMUM_OUTER_SIZE,
  STABLE_UI_TITLEBAR_HEIGHT,
  applyStableUiWindowMaterial,
  getStableWindowBrowserOptions,
  resolveStableUiDefaultWindowBounds,
  resolveStableWindowTheme
} = require("../dist-electron/stableUiWindowLifecycle.js");
const { StableWindowRuntime } = require("../dist-electron/stableWindowRuntime.js");

assert.equal(STABLE_UI_TITLEBAR_HEIGHT, 40);
assert.equal(STABLE_UI_LAYOUT_FILE_NAME, "window-layout-stable-ui.json");
assert.deepEqual(STABLE_UI_DEFAULT_MAXIMUM_OUTER_SIZE, { width: 1600, height: 1000 });
assert.deepEqual(STABLE_UI_MINIMUM_OUTER_SIZE, { width: 300, height: 170 });
assert.deepEqual(resolveStableUiDefaultWindowBounds({ x: 0, y: 0, width: 3440, height: 1400 }), { x: 920, y: 200, width: 1600, height: 1000 });
assert.deepEqual(resolveStableUiDefaultWindowBounds({ x: 0, y: 0, width: 240, height: 150 }), { x: 0, y: 0, width: 240, height: 150 });
assert.equal(resolveStableWindowTheme("system", true), "dark");
assert.equal(resolveStableWindowTheme("light", true), "light");
assert.deepEqual(getStableWindowBrowserOptions("dark"), {
  frame: true,
  transparent: false,
  backgroundColor: "#00000000",
  roundedCorners: true,
  titleBarStyle: "hidden",
  titleBarOverlay: { color: "#00000000", symbolColor: "#D8D8D8", height: 40 }
});

const materialCalls = [];
assert.equal(applyStableUiWindowMaterial({
  setBackgroundMaterial: (material) => materialCalls.push(["material", material]),
  setBackgroundColor: (color) => materialCalls.push(["color", color])
}, "light", "mica"), "mica");
assert.deepEqual(materialCalls, [["material", "mica"], ["color", "#00000000"]]);

const fallbackCalls = [];
assert.equal(applyStableUiWindowMaterial({
  setBackgroundMaterial: (material) => { fallbackCalls.push(["material", material]); if (material === "acrylic") throw new Error("unsupported"); },
  setBackgroundColor: (color) => fallbackCalls.push(["color", color])
}, "dark", "acrylic"), "solid");
assert.deepEqual(fallbackCalls, [["material", "acrylic"], ["material", "none"], ["color", "#202020"]]);

const runtime = new StableWindowRuntime();
runtime.configure("system", "mica");
assert.equal(runtime.usesSystemTheme, true);
assert.equal(runtime.getBrowserOptions("main", true).titleBarOverlay.symbolColor, "#D8D8D8");

const mainSource = read("electron/main.ts");
const preferenceSource = read("electron/preferenceStore.ts");
const preloadSource = read("electron/preload.ts");
const sharedTypesSource = read("src/shared/types.ts");
const settingsSource = read("src/renderer/settings-window/SettingsWindowApp.tsx");
const quickActionsSource = read("src/renderer/settings/QuickActionSettingsRows.tsx");
const titlebarPortalSource = read("src/renderer/window-presentation/WindowTitlebarPortal.tsx");

assert.match(mainSource, /const stableWindowRuntime = new StableWindowRuntime\(\)/u);
assert.match(mainSource, /windowLayoutManager\.setPreferences\(\{ rememberWindowLayout: true \}\)/u);
assert.match(mainSource, /const getShellMinimumSize = \(_state: Cap7CEShellState\) => \(\{ \.\.\.STABLE_UI_MINIMUM_OUTER_SIZE \}\)/u);
assert.match(mainSource, /const openSettings = async \(\) => Boolean\(await settingsWindowController\?\.open\(\)\)/u);
assert.match(mainSource, /previewWindow\.on\("unmaximize", applyLatestPreviewContentSize\)/u);
assert.match(mainSource, /restoreStableDefaultBounds[\s\S]*?resolveStableUiDefaultWindowBounds[\s\S]*?rememberUserMovedShellBounds\(defaultBounds\)/u);
assert.match(mainSource, /state === "normal" && options\?\.forceBounds[\s\S]*?activateShellModeShortcut\("normal", true\)/u);
assert.match(mainSource, /mainWindow\.on\("maximize"[\s\S]*?mainWindow\.on\("unmaximize"/u);
for (const source of [mainSource, preferenceSource, preloadSource, sharedTypesSource]) {
  assert.doesNotMatch(source, /WindowPresentation|windowPresentation|presentationMode|compatibilityNative/u);
}
assert.doesNotMatch(preferenceSource, /parsed\.(?:rememberWindowLayout|windowPresentationMode|shortcutActions)/u);
assert.doesNotMatch(preloadSource, /updateRememberWindowLayout|switchWindowPresentationMode|revealAfterShellStateReady/u);
assert.match(settingsSource, /<QuickActionSettingsRows quickActionGlobalEnabled=/u);
assert.doesNotMatch(quickActionsSource, /activateMicro|activateMini|stableUi/u);
assert.match(titlebarPortalSource, /createPortal\(children, document\.body\)/u);

console.log(JSON.stringify({
  stableOnlyBrowserOptionsVerified: true,
  selectableMaterialWithSolidFallbackVerified: true,
  fixedStableLayoutNamespaceVerified: true,
  nativeMaximizeAndSnapLifecycleVerified: true,
  legacyPresentationContractsRemoved: true,
  retiredPreferenceFieldsAbsent: true,
  scrollingCannotReparentNativeDragRegion: true
}));
