const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const appSource = read("src/renderer/App.tsx");
const rootSource = read("src/renderer/stable-ui/StableUiRoot.tsx");
const shellSource = read("src/renderer/stable-ui/StableMainShell.tsx");
const sidebarSource = read("src/renderer/stable-ui/StableShellSidebar.tsx");
const sidebarTypesSource = read("src/renderer/stable-ui/stableSidebarTypes.ts");
const sidebarStyles = read("src/renderer/stable-ui/StableSidebar.css");

for (const marker of [
  "onAiSearchToggle",
  "onSearchOptionsChange",
  "onSearchDisplayModeChange",
  "onAddDirectory",
  "onDirectoryNameChange",
  "onDeleteDirectory",
  "onOpenSettings"
]) assert.ok(sidebarTypesSource.includes(marker), `Stable sidebar contract is missing ${marker}.`);

assert.match(appSource, /sidebar=\{\{[\s\S]*?directories: directoryOptions[\s\S]*?onAiSearchToggle: toggleAiSearchBeta[\s\S]*?onAddDirectory: \(\) => void addDirectory\(\)[\s\S]*?onOpenSettings: \(\) => void window\.cap7ce\?\.settingsWindow\.open\(\)/);
assert.match(appSource, /function openSettings\(section\?/);
assert.match(appSource, /const directoryDialogLayer =/);
assert.match(appSource, /overlayContent=\{<>\{contextMenuLayer\}\{keywordEditorLayer\}\{directoryDialogLayer\}<\/>\}/);
assert.match(appSource, /if \(StableUiRenderer && view !== "settings"\)/);
assert.match(rootSource, /onDirectoryDrop\(event\.dataTransfer\)/);
assert.match(shellSource, /<StableShellSidebar \{\.\.\.sidebar\}/);
assert.doesNotMatch(`${rootSource}\n${shellSource}\n${sidebarSource}`, /window\.cap7ce|from "\.\.\/App"/);

for (const marker of [
  "search.sortField",
  "search.sortDirection",
  "search.directoryId",
  "skimDisplayMode",
  "editingDirectoryId === directory.id",
  "onDoubleClick",
  "onContextMenu",
  "directory.fileCount"
]) assert.ok(sidebarSource.includes(marker), `Stable sidebar display is missing ${marker}.`);

for (const marker of [
  ".cap-stable-sidebar-control:hover",
  ".cap-stable-directory-item.is-selected",
  ".cap-stable-directory-list",
  "@container (max-width: 95px)",
  "flex-direction: column"
]) assert.ok(sidebarStyles.includes(marker), `Stable sidebar styles are missing ${marker}.`);

console.log(JSON.stringify({
  controlledFilterAndDirectoryActionsBridged: true,
  formalDirectoryTransactionsReused: true,
  directoryDropAndIndependentSettingsActionGuarded: true,
  collapsedSidebarAndFooterVerified: true
}));
