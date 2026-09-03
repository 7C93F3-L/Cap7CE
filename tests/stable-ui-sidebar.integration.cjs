const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const appSource = read("src/renderer/App.tsx");
const rootSource = read("src/renderer/stable-ui/StableUiRoot.tsx");
const shellSource = read("src/renderer/stable-ui/StableMainShell.tsx");
const sidebarSource = read("src/renderer/stable-ui/StableShellSidebar.tsx");
const stableUiIconSource = read("src/renderer/stable-ui/StableUiIcon.tsx");
const skimToolbarSource = read("src/renderer/stable-ui/StableSkimToolbar.tsx");
const sidebarTypesSource = read("src/renderer/stable-ui/stableSidebarTypes.ts");
const sidebarStyles = read("src/renderer/stable-ui/StableSidebar.css");
const brandLogo = read("src/renderer/assets/icons/logo-cap7ce.svg");

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
  "cap-stable-brand-logo",
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
  ".cap-stable-brand-logo",
  ".cap-stable-all-directories-row",
  ".cap-stable-sidebar-control:hover",
  ".cap-stable-directory-item.is-selected",
  ".cap-stable-directory-list",
  "@container (max-width: 95px)",
  "flex-direction: column"
]) assert.ok(sidebarStyles.includes(marker), `Stable sidebar styles are missing ${marker}.`);

assert.match(brandLogo, /viewBox="0 0 58\.77 15"/u);
assert.match(sidebarStyles, /logo-cap7ce\.svg/u);
assert.match(sidebarSource, /<StableUiIcon name="ai" active=\{aiSearchEnabled\}/u);
assert.match(sidebarSource, /<StableUiIcon name="folder" active=\{selected\}/u);
assert.match(sidebarSource, /<StableUiIcon name="skim" active=\{skimOpen\}/u);
assert.match(sidebarSource, /name="sort" sortDirection=\{search\.sortDirection\} className="cap-stable-sidebar-icon cap-stable-sort-icon"/u);
assert.match(sidebarSource, /name="skim" active=\{skimOpen\} className="cap-stable-footer-icon cap-stable-skim-icon"/u);
assert.match(sidebarSource, /cap-stable-settings-button[\s\S]*?<StableUiIcon name="settings"[\s\S]*?<StableUiIcon name="settings" active/u);
assert.match(sidebarStyles, /\.cap-stable-settings-button:active \.cap-stable-settings-icon-active \{ display: block; \}/u);
assert.match(sidebarStyles, /\.cap-stable-sort-icon \{ width: 30px; height: 30px; \}/u);
assert.match(sidebarStyles, /\.cap-stable-footer-icon \{ width: 20px; height: 20px;[^}]*\} \.cap-stable-skim-icon \{ width: 22px; height: 22px; \}/u);
assert.doesNotMatch(sidebarStyles, /\.cap-stable-footer-icon\s*\{[^}]*opacity:/u);
assert.match(stableUiIconSource, /icon-sort-asc\.svg\?raw/u);
assert.match(stableUiIconSource, /sortDirection === "asc" \? sortAscIcon : sortDescIcon/u);
assert.match(skimToolbarSource, /name="sort" sortDirection=\{sortDirection\}/u);
assert.match(skimToolbarSource, /name="sort" sortDirection=\{sortDirection\} className="cap-stable-sidebar-icon cap-stable-sort-icon"/u);
assert.match(skimToolbarSource, /name="scope" active=\{flyout\?\.kind === "scope"\}/u);

console.log(JSON.stringify({
  stableBrandAndDirectoryRhythmPresent: true,
  controlledFilterAndDirectoryActionsBridged: true,
  formalDirectoryTransactionsReused: true,
  directoryDropAndIndependentSettingsActionGuarded: true,
  collapsedSidebarAndFooterVerified: true,
  stableIconStatesAndLegacySortIconsVerified: true
}));
