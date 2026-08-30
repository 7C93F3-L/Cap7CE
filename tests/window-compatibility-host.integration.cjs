const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");
const viewportSource = fs.readFileSync(path.join(root, "src", "renderer", "controllers", "useShellViewportMetrics.ts"), "utf8");
const maximizeControllerSource = fs.readFileSync(path.join(root, "electron", "compatibilityNativeMaximizeController.ts"), "utf8");

assert.match(mainSource, /normalizedRequestedWindowPresentationMode = normalizeWindowPresentationMode\(requestedWindowPresentationMode\);[\s\S]*?windowPresentationRuntime\.configure\(await windowPresentationSwitchRuntime\.resolveStartupMode\(normalizedRequestedWindowPresentationMode\), preferences\.themePreference\);[\s\S]*?runtimeDiagnostics\.log\("info", "window\.presentation\.startup",[\s\S]*?windowLayoutManager = new WindowLayoutManager\(new WindowLayoutStore\(path\.join\(app\.getPath\("userData"\), "config", windowPresentationRuntime\.layoutFileName\)\)\);[\s\S]*?await windowLayoutManager\.load\(\);/u);
assert.match(mainSource, /createApplicationWindow\("main", \{[\s\S]*?\.\.\.getMainWindowPresentationOptions\(\)[\s\S]*?paintWhenInitiallyHidden: true/u);
assert.match(mainSource, /const getShellContentBounds = \(bounds: Electron\.Rectangle\) => shellWindowPresentationSizing\.getContentBounds\(bounds\)/u);
assert.match(mainSource, /resolveResizeTargetState\(activeShellState, getShellContentBounds\(currentBounds\), getShellContentWorkArea\(currentDisplay\.workArea\)\)/u);
assert.match(mainSource, /windowLayoutManager\.captureBounds\(\{ state, bounds, display:/u);
assert.match(mainSource, /compatibilityNativeMaximizeController\.attach\(mainWindow\);/u);
assert.match(maximizeControllerSource, /window\.on\("maximize", this\.handleMaximize\);/u);
assert.match(maximizeControllerSource, /window\.on\("unmaximize", this\.handleRestore\);/u);
assert.match(mainSource, /miniStandardHeight: miniDefaultHeightPx,[\s\S]*?titlebarHeight: getMainWindowTitlebarHeight\(\)/u);
assert.match(viewportSource, /window\.innerHeight - currentTitlebarHeight/u);
assert.match(mainSource, /windowPresentationRuntime\.getBrowserOptions\("preview", nativeTheme\.shouldUseDarkColors\)/u);

console.log(JSON.stringify({
  presentationPolicyLoadedBeforeMainWindow: true,
  compatibilityLayoutNamespaceActivated: true,
  contentHeightDrivesResizeThresholds: true,
  outerBoundsDriveLayoutMemory: true,
  nativeMaximizeRestoreHooked: true,
  rendererViewportExcludesTitlebar: true,
  previewWindowUsesActivePresentationPolicy: true
}));
