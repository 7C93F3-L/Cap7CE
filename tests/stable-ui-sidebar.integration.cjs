const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const appSource = read("src/renderer/App.tsx");
const rootSource = read("src/renderer/stable-ui/StableUiRoot.tsx");
const shellSource = read("src/renderer/stable-ui/StableMainShell.tsx");
const sidebarSource = read("src/renderer/stable-ui/StableShellSidebar.tsx");
const directoryFlyoutSource = read("src/renderer/stable-ui/StableDirectoryFlyout.tsx");
const directoryTooltipSource = read("src/renderer/stable-ui/StableDirectoryTooltip.tsx");
const sidebarFlyoutSource = read("src/renderer/stable-ui/StableSidebarFlyout.tsx");
const stableUiIconSource = read("src/renderer/stable-ui/StableUiIcon.tsx");
const skimToolbarSource = read("src/renderer/stable-ui/StableSkimToolbar.tsx");
const sidebarTypesSource = read("src/renderer/stable-ui/stableSidebarTypes.ts");
const sidebarStyles = read("src/renderer/stable-ui/StableSidebar.css");
const directoryFlyoutStyles = read("src/renderer/stable-ui/StableDirectoryFlyout.css");
const navigationStateStyles = read("src/renderer/stable-ui/StableNavigationState.css");
const materialContrastStyles = read("src/renderer/stable-ui/StableMaterialContrast.css");
const brandLogo = read("src/renderer/assets/icons/logo-cap7ce.svg");
const zhLocalizationSource = read("electron/localization.ts");
const enLocalizationSource = read("electron/locales/en-US.ts");

for (const marker of [
  "onAiSearchToggle",
  "onSearchOptionsChange",
  "onSearchDisplayModeChange",
  "onAddDirectory",
  "onDirectoryNameChange",
  "onMoveDirectory",
  "onOpenDirectory",
  "onDeleteDirectory",
  "onOpenSettings"
]) assert.ok(sidebarTypesSource.includes(marker), `Stable sidebar contract is missing ${marker}.`);

assert.match(appSource, /sidebar=\{\{[\s\S]*?directories: directoryOptions[\s\S]*?onAiSearchToggle: toggleAiSearchBeta[\s\S]*?onAddDirectory: \(\) => void addDirectory\(\)[\s\S]*?onOpenSettings: \(\) => void window\.cap7ce\?\.settingsWindow\.open\(\)/);
assert.match(appSource, /const openSettingsWindow = useCallback\(\(\) => \{[\s\S]*?settingsWindow\.open\(\)/u);
assert.match(appSource, /const directoryDialogLayer =/);
assert.match(appSource, /overlayContent=\{<>\{contextMenuLayer\}\{keywordEditorLayer\}\{deleteFilesPanel\}\{directoryDialogLayer\}<\/>\}/);
assert.match(appSource, /return \([\s\S]*?<StableUiRenderer/u);
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
  "is-menu-open",
  "directory.fileCount"
]) assert.ok(sidebarSource.includes(marker), `Stable sidebar display is missing ${marker}.`);

for (const marker of [
  ".cap-stable-brand-logo",
  ".cap-stable-all-directories-row",
  ".cap-stable-sidebar-control:where(:hover, :focus-visible)",
  ".cap-stable-directory-item.is-selected",
  ".cap-stable-directory-list",
  "@container (max-width: 95px)",
  "flex-direction: column"
]) assert.ok(sidebarStyles.includes(marker), `Stable sidebar styles are missing ${marker}.`);

assert.match(brandLogo, /viewBox="0 0 58\.77 15"/u);
assert.match(zhLocalizationSource, /"stableUi\.sidebar\.searchScope": "查看范围"/u);
assert.match(enLocalizationSource, /"stableUi\.sidebar\.searchScope": "View Scope"/u);
assert.match(zhLocalizationSource, /"skim\.open": "打开 skim"[\s\S]*?"skim\.exit": "收起 skim"/u);
assert.match(sidebarStyles, /logo-cap7ce\.svg/u);
assert.match(sidebarSource, /<StableUiIcon name="ai" active=\{aiSearchEnabled\}/u);
assert.doesNotMatch(sidebarSource, /cap-stable-switch/u);
assert.doesNotMatch(sidebarStyles, /\.cap-stable-switch/u);
assert.match(sidebarSource, /<StableUiIcon name="folder" active=\{selected\}/u);
assert.match(sidebarSource, /cap-stable-directory-list-frame cap-scroll-viewport-frame cap-scroll-viewport-frame-vertical/u);
assert.match(sidebarSource, /<CustomScrollbar scrollContainerRef=\{directoryScrollRef\} orientation="vertical" \/>/u);
assert.match(sidebarStyles, /\.cap-stable-directory-list-frame \{[^}]*align-items: start;[^}]*\}[\s\S]*?\.cap-stable-directory-list \{[^}]*align-self: start;[^}]*height: auto !important;[^}]*max-height: 100%;/u);
assert.match(sidebarSource, /<StableUiIcon name="skim" active=\{skimOpen\}/u);
assert.match(sidebarSource, /name="sort" sortDirection=\{search\.sortDirection\} className="cap-stable-sidebar-icon cap-stable-sort-icon"/u);
assert.match(sidebarSource, /name="skim" active=\{skimOpen\} className="cap-stable-footer-icon cap-stable-skim-icon"/u);
assert.match(sidebarSource, /cap-stable-settings-button[\s\S]*?<StableUiIcon name="settings"[\s\S]*?<StableUiIcon name="settings" active/u);
assert.match(sidebarSource, /aria-label=\{t\("stableSettings\.rename"\)\}/u);
assert.match(sidebarSource, /window\.setTimeout\([\s\S]*?, 150\)/u);
assert.match(sidebarSource, /onPointerEnter=\{\(event\) => showDirectoryTooltipSoon\(directory, (?:true|false), event\)\}[\s\S]*?onPointerLeave=\{hideDirectoryTooltip\}[\s\S]*?onPointerDown=\{hideDirectoryTooltip\}/u);
assert.match(sidebarSource, /onScroll=\{hideDirectoryTooltip\}/u);
assert.match(sidebarSource, /directoryTooltip && flyout === null/u);
assert.match(sidebarSource, /const openFlyout = [\s\S]*?setFlyout\(\(current\) => current\?\.kind === kind \? null : \{ kind, anchor \}\)/u);
assert.equal((sidebarSource.match(/onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/g) ?? []).length, 2);
assert.match(sidebarSource, /aria-label=\{accessibleLabel\}/u);
assert.doesNotMatch(sidebarSource, /type="button" title=\{title\} aria-pressed/u);
assert.match(directoryTooltipSource, /const left = anchor\.right \+ 5[\s\S]*?Math\.min\(184, window\.innerWidth - left - 5\)[\s\S]*?createPortal\([\s\S]*?role="tooltip"[\s\S]*?cap-stable-directory-tooltip-title[\s\S]*?directory\.name[\s\S]*?cap-stable-directory-tooltip-count[\s\S]*?search\.fileCount[\s\S]*?directory\.fileCount[\s\S]*?pathLeading[\s\S]*?pathTrailing/u);
assert.match(directoryTooltipSource, /stableUi\.sidebar\.addedDirectories[\s\S]*?directoryCount/u);
assert.match(sidebarSource, /directoryCount=\{addedDirectories\.length\}/u);
assert.match(appSource, /onOpenDirectory: \(path\) => void window\.cap7ce\?\.files\.open\(path\)/u);
assert.match(sidebarSource, /<StableDirectoryFlyout[^>]*onOpen=\{onOpenDirectory\}/u);
assert.match(sidebarSource, /openDirectoryFlyout[\s\S]*?currentTarget\.closest<HTMLElement>\("\.cap-stable-directory-row"\)[\s\S]*?anchor\.getBoundingClientRect\(\)/u);
assert.match(sidebarStyles, /\.cap-stable-directory-tooltip \{[^}]*background: var\(--cap-stable-flyout-surface\);[^}]*pointer-events: none;/u);
assert.match(sidebarStyles, /\.cap-stable-sidebar-flyout \{[^}]*width: 184px;[\s\S]*?\.cap-stable-directory-tooltip \{[^}]*max-width: 184px;/u);
assert.match(sidebarStyles, /\.cap-stable-directory-tooltip-title \{[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;[\s\S]*?\.cap-stable-directory-tooltip-count \{[^}]*text-overflow: ellipsis;[\s\S]*?\.cap-stable-directory-tooltip-path > span:first-child \{[^}]*text-overflow: ellipsis;/u);
assert.match(directoryFlyoutSource, />\{t\("stableSettings\.rename"\)\}<\/button>/u);
assert.match(directoryFlyoutSource, /disabled=\{directoryIndex <= 0\}[\s\S]*?onMove\(directory\.id, "up"\)[\s\S]*?stableUi\.sidebar\.moveDirectoryUp/u);
assert.match(directoryFlyoutSource, /disabled=\{directoryIndex < 0 \|\| directoryIndex >= directories\.length - 1\}[\s\S]*?onMove\(directory\.id, "down"\)[\s\S]*?stableUi\.sidebar\.moveDirectoryDown/u);
assert.match(directoryFlyoutSource, /cap-stable-sidebar-flyout-separator" role="separator"/u);
assert.match(directoryFlyoutSource, /onOpen\(directory\.path\)[\s\S]*?t\("context\.showInFolder"\)[\s\S]*?t\("stableSettings\.rename"\)/u);
assert.match(sidebarStyles, /\.cap-stable-settings-button:active \.cap-stable-settings-icon-active \{ display: block; \}/u);
assert.match(sidebarStyles, /\.cap-stable-sort-icon \{ width: 30px; height: 30px; transform: translateY\(-2px\); \}/u);
assert.match(sidebarStyles, /@container \(max-width: 95px\)[\s\S]*?\.cap-stable-directory-item \{ grid-template-columns: minmax\(0, 1fr\); width: 32px;[\s\S]*?\.cap-stable-directory-row \{ display: block; width: 32px; margin-inline: auto; border-radius: 9px; \}/u);
assert.match(sidebarSource, /className=\{`cap-stable-directory-row\$\{selected \? " is-selected" : ""\}\$\{menuOpen \? " is-menu-open" : ""\}`\}/u);
assert.match(sidebarStyles, /\.cap-stable-directory-row \{[^}]*grid-template-columns: minmax\(0, 1fr\) 32px;/u);
assert.match(sidebarStyles, /\.cap-stable-directory-row:hover \{ background: var\(--cap-stable-control-hover\); \}[\s\S]*?\.cap-stable-directory-row:active \{ background: var\(--cap-stable-control-pressed\); \}[\s\S]*?\.cap-stable-directory-row\.is-selected \{[^}]*linear-gradient\(45deg, var\(--theme-color\) 0%, var\(--accent-color\) 100%\); \}[\s\S]*?\.cap-stable-directory-row > \.cap-stable-directory-item\.is-selected \{ background: transparent; \}/u);
assert.match(directoryFlyoutStyles, /\.cap-stable-directory-row\.is-menu-open \{ background: var\(--cap-stable-control-hover\); \}[\s\S]*?\.cap-stable-directory-row\.is-menu-open \.cap-stable-directory-more \{ opacity: \.72; \}/u);
assert.match(sidebarStyles, /\.cap-stable-directory-more \{[^}]*justify-self: center;[^}]*width: 24px; height: 24px;[^}]*margin-left: 0;[^}]*border-radius: 50%;/u);
assert.match(sidebarStyles, /\.cap-stable-directory-more:hover \{ color: var\(--text-main\); background: var\(--cap-stable-directory-more-hover, color-mix\(in srgb, currentColor 14%, transparent\)\); opacity: 1; \}/u);
assert.match(sidebarStyles, /\.cap-stable-directory-row\.is-selected:hover \.cap-stable-directory-more \{ opacity: 1; \}[\s\S]*?theme-dark:is\(\[data-window-material="acrylic"\], \[data-window-material="mica"\]\)[^}]*background: rgb\(0 0 0 \/ 32%\);/u);
assert.match(materialContrastStyles, /\.cap-stable-ui\.theme-dark\[data-window-material="acrylic"\][\s\S]*?--cap-stable-control-hover: rgb\(255 255 255 \/ 18%\);[\s\S]*?--cap-stable-control-pressed: rgb\(255 255 255 \/ 24%\);[\s\S]*?--cap-stable-directory-more-hover: rgb\(255 255 255 \/ 24%\);/u);
assert.match(sidebarStyles, /\.cap-stable-sidebar-control:where\(:hover, :focus-visible\) \{ background: var\(--cap-stable-control-hover\); \}[\s\S]*?\.cap-stable-sidebar-control:active \{ background: var\(--cap-stable-control-pressed\); \}[\s\S]*?aria-pressed="true"[\s\S]*?aria-expanded="true"[^}]*linear-gradient\(45deg, var\(--theme-color\) 0%, var\(--accent-color\) 100%\);/u);
assert.match(sidebarStyles, /\.cap-stable-sidebar-footer button:where\(:hover, :focus-visible\) \{ background: var\(--cap-stable-control-hover\); \}[\s\S]*?button:active \{ background: var\(--cap-stable-control-pressed\); \}[\s\S]*?\.cap-stable-sidebar-footer button\.is-active \{ background: var\(--cap-stable-navigation-state\); \}/u);
assert.match(sidebarStyles, /\.cap-stable-directory-item\.is-editing \{ background: transparent; \}/u);
assert.match(sidebarStyles, /\.cap-stable-directory-item input \{[^}]*border-radius: 999px; outline: 0;[^}]*background: var\(--cap-stable-navigation-state\);/u);
assert.match(navigationStateStyles, /--cap-stable-navigation-state: rgb\(255 255 255 \/ 50%\);[\s\S]*?theme-dark[\s\S]*?--cap-stable-navigation-state: rgb\(0 0 0 \/ 24%\);/u);
assert.match(navigationStateStyles, /--cap-stable-control-hover: rgb\(31 31 31 \/ 12%\);[\s\S]*?--cap-stable-control-pressed: rgb\(31 31 31 \/ 17%\);[\s\S]*?theme-dark[\s\S]*?--cap-stable-control-hover: rgb\(255 255 255 \/ 14%\);[\s\S]*?--cap-stable-control-pressed: rgb\(255 255 255 \/ 20%\);/u);
assert.match(sidebarStyles, /\.app \.cap-stable-directory-item input:focus,[\s\S]*?input:focus-visible \{ outline: 0; outline-offset: 0; box-shadow: none; \}/u);
assert.match(sidebarStyles, /\.cap-stable-footer-icon \{ width: 20px; height: 20px;[^}]*\} \.cap-stable-skim-icon \{ width: 22px; height: 22px; \}/u);
assert.match(sidebarStyles, /\.cap-stable-sidebar-flyout \{[^}]*background: var\(--cap-stable-flyout-surface\);[^}]*font: inherit;/u);
assert.match(sidebarStyles, /\.cap-stable-sidebar-flyout button \{[^}]*border-radius: 999px;/u);
assert.match(sidebarStyles, /\.cap-stable-sidebar-flyout button:where\(:hover, :focus-visible\):not\(:disabled\) \{ background: var\(--cap-stable-control-hover\); \}[\s\S]*?button:active:not\(:disabled\) \{ background: var\(--cap-stable-control-pressed\); \}[\s\S]*?button\.is-selected \{[^}]*linear-gradient\(45deg, var\(--theme-color\) 0%, var\(--accent-color\) 100%\); \}/u);
assert.doesNotMatch(sidebarSource, /cap-stable-flyout-title/u);
assert.doesNotMatch(skimToolbarSource, /cap-stable-flyout-title/u);
assert.match(sidebarStyles, /\.cap-stable-sidebar-flyout button\.is-danger \{ color: inherit; \}/u);
assert.match(directoryFlyoutStyles, /\.cap-stable-sidebar-flyout button:disabled[^}]*opacity: \.45/u);
assert.match(directoryFlyoutStyles, /\.cap-stable-sidebar-flyout-separator \{[^}]*height: 1px;/u);
assert.match(sidebarFlyoutSource, /document\.querySelector<HTMLElement>\("\.cap-stable-ui"\) \?\? document\.body/u);
assert.match(sidebarFlyoutSource, /placement === "below"[\s\S]*?anchor\.right - 184[\s\S]*?anchor\.bottom \+ 5/u);
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
  stableIconStatesAndSortIconsVerified: true
}));
