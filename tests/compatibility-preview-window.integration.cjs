const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const mainSource = read("electron/main.ts");
const runtimeSource = read("electron/windowPresentationRuntime.ts");
const dockSource = read("electron/previewDockedShell.ts");
const previewSource = read("src/renderer/PreviewWindowApp.tsx");
const titlebarSource = read("src/renderer/window-presentation/CompatibilityTitlebar.tsx");
const titlebarStyles = read("src/renderer/window-presentation/CompatibilityTitlebar.css");

assert.match(mainSource, /const previewMinimumSize = previewWindowPresentationSizing\.getOuterMinimumSize\(windowPresentationRuntime\.titlebarHeight\)[\s\S]*?\.\.\.windowPresentationRuntime\.getBrowserOptions\("preview", nativeTheme\.shouldUseDarkColors\)/u);
assert.match(mainSource, /previewWindowPresentationSizing\.resolveBounds\(\{ contentWidth, contentHeight, currentBounds: currentPreviewBounds, workArea: display\.workArea, titlebarHeight: windowPresentationRuntime\.titlebarHeight \}\)/u);
assert.match(mainSource, /previewUrl\.searchParams\.set\("presentation", windowPresentationRuntime\.mode\)/u);
assert.match(mainSource, /query: \{ window: "preview", presentation: windowPresentationRuntime\.mode \}/u);
assert.match(mainSource, /isCompatibilityPreviewNativeSnapActive\(\)[\s\S]*?previewDockedShell\.hasActiveSession\(\)/u);
assert.match(mainSource, /previewWindow\.on\("unmaximize", applyLatestPreviewContentSize\)/u);
assert.match(mainSource, /previewWindow\.webContents\.send\("preview:reset"\);[\s\S]*?if \(previewWindow\.isMaximized\(\)\) \{[\s\S]*?previewWindow\.unmaximize\(\);[\s\S]*?\}[\s\S]*?previewWindow\.hide\(\);/u);
assert.match(runtimeSource, /applyPreviewWindowAppearance\([\s\S]*?this\.applyWindowAppearance\("preview"/u);
assert.match(dockSource, /maximized: window\.isMaximized\(\) \|\| isNativeSnapActive\(\)/u);

assert.match(previewSource, /const isCompatibilityWindow = new URLSearchParams\(window\.location\.search\)\.get\("presentation"\) === "compatibility"/u);
assert.match(previewSource, /const previewControlActions: WindowControlAction\[\] = isCompatibilityWindow \? \[\] : \[/u);
assert.match(previewSource, /isCompatibilityWindow && <CompatibilityTitlebar[^>]*?onTogglePinned=\{togglePreviewAlwaysOnTop\}[^>]*?theme=\{previewData\.theme\}/u);
assert.match(previewSource, /viewportHeight - \(isCompatibilityWindow \? COMPATIBILITY_TITLEBAR_HEIGHT : 0\)/u);
assert.match(titlebarSource, /theme \? ` app theme-\$\{theme\}` : ""/u);
assert.match(titlebarStyles, /\.preview-window-compatibility \.preview-window-content,[\s\S]*?\.preview-window-compatibility \.preview-window-scrollbar-slot[\s\S]*?top: calc\(var\(--content-edge-gap\) \+ var\(--compatibility-titlebar-height\)\)/u);
assert.match(titlebarStyles, /\.preview-window-compatibility \.cap-window-control-rail[\s\S]*?top: var\(--compatibility-titlebar-height\)/u);

console.log(JSON.stringify({
  compatibilityPreviewUsesWcoHost: true,
  titlebarAddedOutsideExistingContent: true,
  sharedPinAndNativeControlsUsed: true,
  skimAndSettingsRailPreserved: true,
  nativeCloseMaximizeAndSnapProtected: true,
  maximizedPreviewClosesToHiddenState: true,
  cap7cePreviewPathPreserved: true
}));
