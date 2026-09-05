const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const appSource = read("src/renderer/App.tsx");
const previewSource = read("src/renderer/PreviewWindowApp.tsx");
const mainSource = read("electron/main.ts");
const titlebarSource = read("src/renderer/window-presentation/CompatibilityTitlebar.tsx");
const stableTitlebarSource = read("src/renderer/stable-ui/StableTitlebar.tsx");
const titlebarPortalSource = read("src/renderer/window-presentation/WindowTitlebarPortal.tsx");
const pinButtonSource = read("src/renderer/window-presentation/WindowPinButton.tsx");
const titlebarStyles = read("src/renderer/window-presentation/CompatibilityTitlebar.css");
const rendererEntry = read("src/renderer/main.tsx");

if (!/windowPresentationMode:\s*windowPresentationRuntime\.mode/.test(mainSource)) {
  throw new Error("The main process must continue publishing presentation state while compatibility preview remains supported.");
}

if (/CompatibilityTitlebar|WindowControlRail/.test(appSource)) {
  throw new Error("The product main Renderer must not retain the compatibility titlebar or right rail.");
}

if (!/isCompatibilityWindow\s*&&\s*<CompatibilityTitlebar/.test(previewSource)) {
  throw new Error("Compatibility titlebar must be shared with the compatibility preview window.");
}

if (!titlebarPortalSource.includes('import { createPortal } from "react-dom"')
  || !/createPortal\(children, document\.body\)/.test(titlebarPortalSource)) {
  throw new Error("The shared titlebar host must portal every native drag region directly to document.body.");
}
for (const [label, source] of [["Compatibility", titlebarSource], ["Stable UI", stableTitlebarSource]]) {
  if (!source.includes('import WindowTitlebarPortal') || !/<WindowTitlebarPortal>[\s\S]*?<header/.test(source)) {
    throw new Error(`${label} titlebar must remain outside animated, clipped and scrollable application DOM.`);
  }
}

for (const marker of ["aria-pressed={pinned}", "aria-label={label}", "onClick={onToggle}", "iconPinOnSvg", "iconPinOffSvg"]) {
  if (!pinButtonSource.includes(marker)) {
    throw new Error(`Compatibility pin control is missing ${marker}.`);
  }
}

if (!titlebarSource.includes("<WindowPinButton") || !titlebarSource.includes('className="cap-compatibility-titlebar-pin"')) {
  throw new Error("Compatibility titlebar must use the shared window pin button without changing its stable class contract.");
}

if (!titlebarSource.includes("getWindowPresentationSymbolColor(theme)")
  || !/style=\{theme \? \{ color: getWindowPresentationSymbolColor\(theme\) \}/.test(titlebarSource)
  || /cap-compatibility-titlebar-pin:hover\s*\{[^}]*color:/.test(titlebarStyles)
  || /cap-compatibility-titlebar-pin\[aria-pressed="true"\]\s*\{[^}]*color:/.test(titlebarStyles)) {
  throw new Error("Compatibility pin color must remain identical to the native caption symbols in every state.");
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

if (!/\.cap-shell-compatibility,\s*\.preview-window-compatibility\s*\{[\s\S]*?border-radius:\s*0/.test(titlebarStyles)) {
  throw new Error("Compatibility windows must leave outer corner rendering to the native frame.");
}

if (!/\.cap-shell-compatibility,\s*\.preview-window-compatibility\s*\{[\s\S]*?background:\s*linear-gradient\([\s\S]*?transparent 0 var\(--compatibility-titlebar-height\)[\s\S]*?var\(--app-bg\)/.test(titlebarStyles)
  || !/\.cap-compatibility-titlebar-pin\s*\{[\s\S]*?width:\s*46px[\s\S]*?height:\s*100%/.test(titlebarStyles)
  || !/\.cap-compatibility-titlebar-pin-icon\s*\{[\s\S]*?width:\s*24px[\s\S]*?height:\s*24px/.test(titlebarStyles)) {
  throw new Error("Compatibility titlebar must expose Mica only above opaque content and align the pin control with native caption buttons.");
}

if (!/\.cap-shell-compatibility,\s*\.preview-window-compatibility\s*\{[\s\S]*?border:\s*0/.test(titlebarStyles)
  || !/\.cap-compatibility-titlebar-pin\[aria-pressed="true"\][^{]*\{[^}]*background:\s*transparent/.test(titlebarStyles)) {
  throw new Error("Compatibility windows must not retain custom edge lines or a persistent pin background.");
}

if (!rendererEntry.includes('import "./window-presentation/CompatibilityTitlebar.css";')) {
  throw new Error("Compatibility titlebar domain styles must be loaded by the Renderer entry.");
}

console.log(JSON.stringify({
  nativeOverlaySafeAreaUsed: true,
  pinControlAccessibleAndShared: true,
  titlebarIsolatedFromScrollableShell: true,
  allWcoTitlebarsSharePortalBoundary: true,
  legacyMainTitlebarAndRailRemoved: true,
  compatibilityContentOffsetVerified: true,
  nativeOuterCornersPreserved: true,
  micaTitlebarAndCaptionSizingVerified: true
}));
