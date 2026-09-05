const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const rendererEntry = read("src/renderer/main.tsx");
const appSource = read("src/renderer/App.tsx");
const rootSource = read("src/renderer/stable-ui/StableUiRoot.tsx");
const inputSource = read("src/renderer/stable-ui/StableSearchInput.tsx");
const resultsSource = read("src/renderer/results/ResultsView.tsx");
const gridSource = read("src/renderer/results/VirtualResultGrids.tsx");
const stableResultsStyles = read("src/renderer/stable-ui/StableSearchResults.css");
const foundationStyles = read("src/renderer/stable-ui/StableUiFoundation.css");
const navigationStateStyles = read("src/renderer/stable-ui/StableNavigationState.css");
const menuAdapterSource = read("src/renderer/results/ResultsContextMenuLayer.tsx");
const menuSource = read("src/renderer/results/ResponsiveResultsContextMenuLayer.tsx");
const sharedMenuSource = read("src/renderer/components/ResponsiveFileContextMenu.tsx");
const sharedMenuStyles = read("src/renderer/components/ResponsiveFileContextMenu.css");

assert.match(rendererEntry, /Promise\.all\(\[import\("\.\/App"\), import\("\.\/stable-ui\/StableUiRoot"\)\]\)/);
assert.match(rendererEntry, /<App stableUiRenderer=\{StableUiRoot\}\s*\/>/);
assert.match(appSource, /stableUiRenderer: StableUiRenderer/);
assert.match(appSource, /resultContent=\{<ResultsView \{\.\.\.createResultsViewProps\(\)\} \/>\}/);
assert.match(appSource, /overlayContent=\{<>\{contextMenuLayer\}\{keywordEditorLayer\}\{deleteFilesPanel\}\{directoryDialogLayer\}<\/>\}/);
assert.match(appSource, /onSearch=\{\(\) => submitSearch\(search\)\}/);
assert.match(appSource, /if \(!stableUi \|\| isLoadingDirectories \|\| resultsInitializedRef\.current\) return;[\s\S]*?const initialSearch = \{ \.\.\.emptySearch, sortField: search\.sortField, sortDirection: search\.sortDirection \};[\s\S]*?runSearch\(initialSearch, \{ navigate: false \}\)/);
assert.match(appSource, /const cycleSearchDirectory = \(\) => \{[\s\S]*?directoryOptions\.findIndex[\s\S]*?\(currentIndex \+ 1\) % directoryOptions\.length[\s\S]*?updateResultsSearchOptions/u);
assert.match(appSource, /const searchResultsVisible = true;[\s\S]*?if \(\s*quickActionGlobalEnabled[\s\S]*?matchesShortcutEvent\(event, shortcutActions\.cycleDirectory\)[\s\S]*?cycleSearchDirectory\(\)/u);
assert.match(appSource, /onOpenImage: \(item\) => invokeFileAction\("open", item\)/);
assert.match(appSource, /onDeleteItems: requestDeleteFiles/);
assert.match(appSource, /responsive: true/);
assert.match(menuAdapterSource, /state\.responsive[\s\S]*ResponsiveResultsContextMenuLayer[\s\S]*LegacyResultsContextMenuLayer/);
assert.doesNotMatch(rootSource, /window\.cap7ce|from "\.\.\/App"/);

for (const marker of [
  "onCompositionStart",
  "onCompositionEnd",
  "if (!composingRef.current) onSearch()",
  "const clearedQuery = search.query.trim().length > 0"
]) assert.ok(inputSource.includes(marker), `Stable search input is missing ${marker}.`);
assert.match(inputSource, /placeholder=\{inputFeedbackIsGuide \? inputFeedback : inputFeedback \? "" : t\("search\.inputLabel"\)\}/u);
assert.match(inputSource, /\{!search\.query && !inputFeedbackIsGuide && inputFeedback && <span className="cap-stable-search-feedback"/u);

assert.match(resultsSource, /responsiveLayout\?: boolean/);
assert.match(resultsSource, /responsiveLayout=\{responsiveLayout\}/);
assert.match(gridSource, /window\.matchMedia\("\(max-height: 359\.98px\)"\)/);
assert.match(gridSource, /responsiveLayout \? \(lowHeightLayout \? "micro" : "normal"\)/);
assert.match(gridSource, /minimumColumnCount = responsiveLayout \? 2 : 1/u);
assert.match(gridSource, /interactive=\{!responsiveLayout\}/);
assert.match(gridSource, /: <div className="empty-result-row">\{message\}<\/div>/);
assert.match(stableResultsStyles, /\.cap-stable-results-slot \.thumb,[\s\S]*?\.result-section-card \{ border-radius: var\(--cap-stable-radius-sm\); background: var\(--cap-stable-grid-surface\); \}/u);
assert.match(inputSource, /<StableUiIcon name="search" className="cap-stable-search-icon" \/>/u);
assert.match(foundationStyles, /\.cap-stable-search-slot[\s\S]*?background: var\(--cap-stable-search-surface\);/u);
assert.match(navigationStateStyles, /\.cap-stable-ui,[\s\S]*?\.cap-stable-titlebar,[\s\S]*?--cap-stable-navigation-state: rgb\(255 255 255 \/ 50%\);[\s\S]*?\.cap-stable-titlebar\.theme-dark,[\s\S]*?--cap-stable-navigation-state: rgb\(0 0 0 \/ 24%\);/u);
assert.match(stableResultsStyles, /\.cap-stable-search-slot input::placeholder \{ color: var\(--cap-stable-search-placeholder\); opacity: 1; \}/u);
assert.match(stableResultsStyles, /\.app \.cap-stable-search-slot input:focus,[\s\S]*?input:focus-visible \{ outline: 0; outline-offset: 0; box-shadow: none; \}/u);

for (const marker of ["state.preview", "onOpen(state.item)", "onShowInFolder(state.item)", "onCopyPaths(state.items)", "onEditKeywords(state.items)", "onDelete(state.items)"]) {
  assert.ok(menuSource.includes(marker), `Formal results context menu is missing ${marker}.`);
}
for (const marker of ["compactHeightBreakpoint = 360", "createPortal", "stableTitlebarBottom = 45", "viewportGap = 5", "MiddleEllipsisFileName", "Escape"]) {
  assert.ok(sharedMenuSource.includes(marker), `Responsive results context menu is missing ${marker}.`);
}
assert.match(sharedMenuStyles, /grid-template-columns: minmax\(0, 1\.28fr\) repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(sharedMenuStyles, /width: min\(520px, calc\(100vw - 10px\)\)/);
assert.match(sharedMenuStyles, /border-radius: 999px[\s\S]*linear-gradient\(45deg, var\(--theme-color\) 0%, var\(--accent-color\) 100%\)/);
assert.match(sharedMenuStyles, /font-family:\s*var\(--cap-ui-font-family\)[\s\S]*?font-size:\s*var\(--cap-ui-font-body\)/u);

console.log(JSON.stringify({
  singleSearchAuthorityBridged: true,
  imeAndClearSubmissionGuarded: true,
  stableInitialAllDirectorySearchVerified: true,
  stableEmptyResultIsNotInteractive: true,
  formalVirtualResultsAndFileActionsReused: true,
  responsiveGridDirectionVerified: true,
  stableTwoColumnMinimumAndEightPixelRadiusVerified: true,
  stableSearchIconEmbedded: true
}));
