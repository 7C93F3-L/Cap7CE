const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const appSource = read("src/renderer/App.tsx");
const mainSource = read("electron/main.ts");
const viewportMetricsSource = read("src/renderer/controllers/useShellViewportMetrics.ts");
const titlebarSource = read("src/renderer/window-presentation/CompatibilityTitlebar.tsx");
const titlebarStyles = read("src/renderer/window-presentation/CompatibilityTitlebar.css");
const rendererEntry = read("src/renderer/main.tsx");

if (!/windowPresentationMode:\s*windowPresentationRuntime\.mode/.test(mainSource)
  || !/setWindowPresentationMode\(metrics\.windowPresentationMode\)/.test(viewportMetricsSource)
  || !/isCompatibilityMode\s*=\s*windowPresentationMode\s*===\s*"compatibility"/.test(appSource)) {
  throw new Error("Renderer must derive the compatibility shell from the presentation mode active in the main process.");
}

if (!/shellState\s*===\s*"capsule"\s*\|\|\s*isCompatibilityMode[\s\S]*?\?\s*\[\]/.test(appSource)) {
  throw new Error("Compatibility mode must remove only the existing top window actions from the right rail.");
}

for (const marker of ["showSkim={showShellSettingsToggle}", "showSettings={showShellSettingsToggle}", "<WindowControlRail"]) {
  if (!appSource.includes(marker)) {
    throw new Error(`Existing right-rail behavior must remain connected: ${marker}`);
  }
}

if (!/isCompatibilityMode\s*&&\s*<CompatibilityTitlebar/.test(appSource)) {
  throw new Error("Compatibility titlebar must render only for the compatibility main shell.");
}

if (!titlebarSource.includes('import { createPortal } from "react-dom"')
  || !/createPortal\([\s\S]*?document\.body\)/.test(titlebarSource)) {
  throw new Error("Compatibility titlebar must remain outside the animated and scrollable shell DOM.");
}

for (const marker of ["aria-pressed={pinned}", "aria-label={label}", "onClick={onTogglePinned}", "iconPinOnSvg", "iconPinOffSvg"]) {
  if (!titlebarSource.includes(marker)) {
    throw new Error(`Compatibility pin control is missing ${marker}.`);
  }
}

for (const marker of ["env(titlebar-area-x", "env(titlebar-area-y", "env(titlebar-area-width", "env(titlebar-area-height", "-webkit-app-region: drag", "-webkit-app-region: no-drag"]) {
  if (!titlebarStyles.includes(marker)) {
    throw new Error(`Compatibility titlebar must respect the WCO safe area: ${marker}`);
  }
}

if (!/\.cap-compatibility-titlebar\s*\{[\s\S]*?position:\s*fixed/.test(titlebarStyles)) {
  throw new Error("Compatibility titlebar must remain fixed to the native overlay safe area.");
}

if (!/\.cap-shell-compatibility \.cap-shell-content[\s\S]*?top:\s*var\(--compatibility-titlebar-height\)/.test(titlebarStyles)
  || !/\.cap-shell-compatibility \.cap-window-control-rail[\s\S]*?top:\s*var\(--compatibility-titlebar-height\)/.test(titlebarStyles)) {
  throw new Error("Compatibility titlebar must sit outside both the content area and retained right rail.");
}

if (!rendererEntry.includes('import "./window-presentation/CompatibilityTitlebar.css";')) {
  throw new Error("Compatibility titlebar domain styles must be loaded by the Renderer entry.");
}

console.log(JSON.stringify({
  nativeOverlaySafeAreaUsed: true,
  pinControlAccessibleAndShared: true,
  titlebarIsolatedFromScrollableShell: true,
  existingRightRailEntriesPreserved: true,
  compatibilityContentOffsetVerified: true
}));
