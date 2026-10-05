const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const shellFiles = [
  "src/renderer/workspace/WorkspaceShell.tsx",
  "src/renderer/stable-ui/StableShellSidebar.tsx",
  "src/renderer/stable-ui/StableSkimSlot.tsx",
  "src/renderer/stable-ui/StableSkimToolbar.tsx",
  "src/renderer/stable-ui/useStableSkimCommands.ts"
];

const rootSource = read("src/renderer/stable-ui/StableUiRoot.tsx");
const titlebarSource = read("src/renderer/stable-ui/StableTitlebar.tsx");
const exploreBarSource = read("src/renderer/stable-ui/StableExploreBar.tsx");
const exploreBarStyles = read("src/renderer/stable-ui/StableExploreBar.css");
const mainShellSource = read(shellFiles[0]);
const sidebarSource = read(shellFiles[1]);
const shellStyles = read("src/renderer/workspace/WorkspaceShell.css");
const inertElementSource = read("src/renderer/stable-ui/useInertElement.ts");
const sidebarStyles = read("src/renderer/stable-ui/StableSidebar.css");
const foundationStyles = read("src/renderer/stable-ui/StableUiFoundation.css");
const resultStyles = read("src/renderer/stable-ui/StableSearchResults.css");
const skimStyles = read("src/renderer/stable-ui/StableSkimPanel.css");
const scrollbarStyles = read("src/renderer/CustomScrollbar.css");
const globalStyles = read("src/renderer/styles.css");
const appSource = read("src/renderer/App.tsx");
const refreshShortcutSource = read("src/renderer/controllers/useCurrentPageRefreshShortcut.ts");
const dialogShellSource = read("src/renderer/dialogs/DialogShell.tsx");
const dialogShellStyles = read("src/renderer/dialogs/DialogShell.css");
const confirmationPanelsSource = read("src/renderer/dialogs/ConfirmationPanels.tsx");
const keywordEditorSource = read("src/renderer/dialogs/KeywordEditorCard.tsx");
const combinedShellSource = shellFiles.map(read).join("\n");

assert.match(rootSource, /<WorkspaceShell resultsToolbar=\{<StableExploreBar[\s\S]*?\/>\} resultContent=\{resultContent\} sidebar=\{sidebar\} skim=\{skim\} workspace=\{workspace\} filters=\{[\s\S]*?\} interactionLocked=\{backgroundInteractionLocked\} \/>/u);
assert.match(titlebarSource, /useInertElement<HTMLElement>\(interactionLocked\)[\s\S]*?ref=\{titlebarRef\}/u);
assert.match(mainShellSource, /useInertElement<HTMLElement>\(interactionLocked\)[\s\S]*?ref=\{shellRef\}/u);
assert.match(inertElementSource, /elementRef\.current\.inert = inert/u);
assert.match(mainShellSource, /resultsKeyboardActive = !skimOpen, skimKeyboardActive = skimOpen/u);
assert.match(mainShellSource, /\{resultContent\(!interactionLocked && resultsKeyboardActive\)\}/u);
assert.match(mainShellSource, /skim\.renderContent\(!interactionLocked && skimKeyboardActive\)/u);
assert.doesNotMatch(titlebarSource, /searchInput|StableSearchInput/u);
assert.match(exploreBarSource, /<StableSearchInput[\s\S]*?onSearch=\{onSearch\}/u);
assert.match(mainShellSource, /\{!skimOpen && resultsToolbar\}\{resultContent\(!interactionLocked && resultsKeyboardActive\)\}/u);
assert.match(titlebarSource, /\{resultStatus\}/);
assert.match(read("src/renderer/workspace/WorkspaceRail.tsx"), /aria-pressed=\{skimOpen\}/);
assert.match(mainShellSource, /<WorkspaceTabBar[\s\S]*?onClose=\{navigation.close\}/u);
assert.match(read("src/renderer/workspace/WorkspaceShell.css"), /@media \(max-height: 359.98px\)[\s\S]*?grid-template-columns: 44px minmax\(0, 1fr\)/u);
assert.match(mainShellSource, /aria-label=\{t\("stableUi\.resultsRegion"\)\}/u);
for (const marker of ["grid-template-columns: 44px minmax(0, 1fr)", "grid-template-rows: 30px minmax(0, 1fr)", "--cap-stable-grid-page-padding: 10px 2px 2px 10px", "container-type: inline-size", "grid-row: 2; width: 100%;"]) assert.ok(shellStyles.includes(marker), `Workspace shell is missing ${marker}`);
for (const file of ["StableMainShell.tsx", "StableMainShell.css", "StableShellResize.css", "useStableShellLayout.ts", "useStableShellResize.ts", "useStableShellSizeMemory.ts", "useStableSkimVisibility.ts", "useStableKeyboardRegion.ts"]) assert.equal(fs.existsSync(path.join(root, "src/renderer/stable-ui", file)), false, `Retired parallel shell must stay removed: ${file}`);
assert.match(read("src/renderer/workspace/useWorkspaceOverlayDismiss.ts"), /stopImmediatePropagation[\s\S]*?closeDirectories[\s\S]*?closeFilters/u);
assert.ok(sidebarStyles.includes("@container (max-width: 95px)"), "Stable UI sidebar is missing its compact container layout.");
assert.match(sidebarStyles, /\.cap-stable-sidebar \{[^}]*app-region: no-drag;[^}]*-webkit-app-region: no-drag;/u);
assert.doesNotMatch(sidebarStyles, /\.cap-stable-sidebar \{[^}]*app-region: drag;/u);
assert.match(foundationStyles, /\.cap-stable-titlebar \{[\s\S]*?app-region: drag;[\s\S]*?-webkit-app-region: drag;/u);
assert.match(sidebarStyles, /\.cap-stable-directory-list-frame \{[^}]*align-items: start;[^}]*\}[\s\S]*?\.cap-stable-directory-list \{[^}]*align-self: start;[^}]*height: auto !important;[^}]*max-height: 100%;/u);
assert.match(exploreBarStyles, /\.cap-stable-explore-bar \.cap-stable-search-slot \{[\s\S]*?width: 100%;[\s\S]*?height: 38px;/u);
assert.match(foundationStyles, /\.cap-stable-titlebar-pin-icon \{ width: 24px; height: 24px; \}/u);
assert.match(foundationStyles, /@media \(max-width: 760px\) \{[\s\S]*?\.cap-stable-result-count \{ display: none; \}[\s\S]*?\.cap-stable-titlebar-pin \{ margin-left: auto; \}[\s\S]*?\}/u);
assert.match(scrollbarStyles, /\.cap-custom-scrollbar-thumb\s*\{[\s\S]*?background: var\(--scrollbar-thumb\);/u);
assert.match(scrollbarStyles, /\.cap-custom-scrollbar-thumb:hover\s*\{[\s\S]*?background: var\(--scrollbar-thumb-hover\);/u);
assert.match(resultStyles, /\.cap-stable-results-slot > \.cap-results-view\s*\{[\s\S]*?padding: var\(--cap-stable-grid-page-padding\);/u);
assert.match(skimStyles, /\.cap-stable-skim-content > \.cap-skim-view\.is-embedded,\s*\.cap-computer-search-browse > \.cap-skim-view\.is-embedded\s*\{[\s\S]*?padding: var\(--cap-stable-grid-page-padding\);/u);
assert.doesNotMatch(shellStyles, /\.cap-stable-main-shell \.cap-scroll-viewport-frame \{ grid-template-columns:/u);
assert.doesNotMatch(scrollbarStyles, /\.cap-custom-scrollbar-thumb\s*\{[^}]*box-shadow:/u);
assert.equal((globalStyles.match(/--scroll-thumb: color-mix\(in srgb, var\(--text-main\) 42%, transparent\);/gu) || []).length, 2);
assert.equal((globalStyles.match(/--scrollbar-thumb-hover: color-mix\(in srgb, var\(--text-main\) 62%, transparent\);/gu) || []).length, 2);
assert.match(dialogShellSource, /cap-dialog-layer[\s\S]*?cap-dialog-surface[\s\S]*?role="alertdialog"/u);
assert.match(confirmationPanelsSource, /<DialogShell[\s\S]*?warningGradientSvg/u);
assert.match(dialogShellStyles, /background: var\(--dialog-surface, var\(--cap-stable-flyout-surface\)\)/u);
assert.match(dialogShellStyles, /backdrop-filter: blur\(18px\)/u);
assert.match(dialogShellStyles, /\.cap-stable-ui \.cap-dialog-layer,\s*\.cap-dialog-layer\.is-stable \{[^}]*top: var\(--cap-stable-titlebar-height, 40px\);[^}]*right: 0;[^}]*bottom: 0;[^}]*left: 0;/u);
assert.doesNotMatch(dialogShellStyles, /\.cap-stable-ui \.cap-dialog-layer,\s*\.cap-dialog-layer\.is-stable \{[^}]*app-region:/u);
assert.match(dialogShellStyles, /\.cap-stable-ui \.cap-dialog-surface,\s*\.cap-dialog-layer\.is-stable \.cap-dialog-surface \{[^}]*app-region: no-drag;[^}]*-webkit-app-region: no-drag;/u);
assert.match(dialogShellStyles, /cap-dialog-actions button:hover:not\(:disabled\)[\s\S]*?background: var\(--cap-accent-gradient\)/u);
assert.match(dialogShellStyles, /\.cap-stable-ui > \.cap-dialog-layer,[\s\S]*?\.cap-dialog-layer\.is-stable \{\s*pointer-events: none;/u);
assert.match(dialogShellStyles, /\.cap-stable-ui > \.cap-dialog-layer > \.cap-dialog-surface,[\s\S]*?\.cap-dialog-layer\.is-stable > \.cap-dialog-surface \{\s*pointer-events: auto;/u);
assert.match(appSource, /resultContent=\{\(active\) => <ResultsView key=\{workspace\.viewKey\} \{\.\.\.createResultsViewProps\(active\)\} \/>\}[\s\S]*?overlayContent=\{<>\{contextMenuLayer\}\{keywordEditorLayer\}\{deleteFilesPanel\}\{directoryDialogLayer\}<\/>\}/u);
assert.match(appSource, /useCurrentPageRefreshShortcut\(\{[\s\S]*?refresh: refreshCurrentPage,[\s\S]*?t\("common\.refreshed"\)/u);
assert.match(refreshShortcutSource, /event\.key !== "F5"[\s\S]*?requestRefresh\(\)/u);
assert.match(refreshShortcutSource, /onRefreshCurrentPageRequested\(requestRefresh\)/u);
assert.match(appSource, /showBackdrop=\{false\}/u);
assert.match(keywordEditorSource, /showBackdrop && <KeywordEditorBackdrop/u);
assert.match(appSource, /backgroundInteractionLocked=\{dialog !== null\}/u);
assert.match(keywordEditorSource, /aria-modal="true"/u);

assert.doesNotMatch(combinedShellSource, /window\.cap7ce|setShellState|shellState|\bmicro\b|\bmini\b|\bnormal\b/);
assert.doesNotMatch(combinedShellSource, /stable-ui-canvas|prototypes[\\/]|C:\\Users\\|示例目录|Example/);
assert.match(combinedShellSource, /aria-hidden="true"/);

console.log(JSON.stringify({
  responsiveShellCompositionVerified: true,
  workspaceLayoutVerified: true,
  narrowAndLowWindowLayoutsVerified: true,
  noBusinessDataOrLegacyShapeState: true,
  keyboardDismissAndLocalizedRegionsVerified: true,
  stablePinIconMatchesCaptionScale: true
}));

assert.match(rootSource, /key=\{`toolbar:\$\{workspace\.viewKey\}`\}/u, "toolbar and result siblings must have separate key namespaces");
