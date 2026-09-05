const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");
const lineControllerSource = fs.readFileSync(path.join(root, "electron", "lineWindowController.ts"), "utf8");
const appSource = fs.readFileSync(path.join(root, "src", "renderer", "App.tsx"), "utf8");
const rendererEntry = fs.readFileSync(path.join(root, "src", "renderer", "main.tsx"), "utf8");
const previewSource = fs.readFileSync(path.join(root, "src", "renderer", "PreviewWindowApp.tsx"), "utf8");
const shellStyles = fs.readFileSync(path.join(root, "src", "renderer", "styles.css"), "utf8");
const presentationPolicySource = fs.readFileSync(path.join(root, "electron", "windowPresentationPolicy.ts"), "utf8");

const getFunctionBody = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
};

const mainWindowCreation = getFunctionBody(mainSource, "const createWindow = () => {", "if (hasSingleInstanceLock)");
const previewWindowCreation = getFunctionBody(mainSource, "const createPreviewWindow = () => {", "const createStartupHintWindow = async () => {");
const startupWindowCreation = getFunctionBody(mainSource, "const createStartupHintWindow = async () => {", "const getShellDisplay = () => (");

for (const [name, source] of [["startup", startupWindowCreation], ["line", lineControllerSource]]) {
  assert.match(source, /frame: false/u, `${name} window must remain frameless at the compatibility baseline`);
  assert.match(source, /transparent: true/u, `${name} window must remain transparent at the compatibility baseline`);
  assert.match(source, /backgroundColor: "#00000000"/u, `${name} window must keep the transparent background baseline`);
}

assert.match(mainWindowCreation, /\.\.\.getMainWindowPresentationOptions\(\)/u);
assert.match(previewWindowCreation, /\.\.\.windowPresentationRuntime\.getBrowserOptions\("preview", nativeTheme\.shouldUseDarkColors\)/u);
assert.doesNotMatch(previewWindowCreation, /transparent: false/u);
assert.match(presentationPolicySource, /if \(!surfacePolicy\.usesWindowControlsOverlay\) \{[\s\S]*?frame: false,[\s\S]*?transparent: true,[\s\S]*?backgroundColor: "#00000000"/u);
assert.doesNotMatch(appSource, /<WindowControlRail|<CompatibilityTitlebar|<HomeView|<SettingsView|from "\.\/WindowControlRail"|from "\.\/settings\/SettingsView"/u);
assert.match(rendererEntry, /<App stableUiRenderer=\{StableUiRoot\} \/>/u);
assert.match(previewSource, /<StablePreviewTitlebar[\s\S]*?<PreviewInformationSidebar/u);
assert.doesNotMatch(previewSource, /WindowControlRail|CompatibilityTitlebar|isCompatibilityWindow|isStableUiPreview/u);
assert.match(shellStyles, /--cap-control-rail: var\(--window-control-rail-width\);/u);
assert.match(shellStyles, /inset: 0 var\(--cap-control-rail\) 0 0;/u);

console.log(JSON.stringify({
  cap7ceTransparentWindowCreationFrozen: true,
  legacyMainControlRailRemoved: true,
  legacyPreviewControlRailRemoved: true,
  stablePreviewShellOnly: true,
  rightRailWidthBaselineFrozen: true
}));
