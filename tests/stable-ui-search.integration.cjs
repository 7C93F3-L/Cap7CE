const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const rendererEntry = read("src/renderer/main.tsx");
const appSource = read("src/renderer/App.tsx");
const contentViewActivitySource = read("src/renderer/controllers/useContentViewActivity.ts");
const rootSource = read("src/renderer/stable-ui/StableUiRoot.tsx");
const inputSource = read("src/renderer/stable-ui/StableSearchInput.tsx");
const resultStatusSource = read("src/renderer/results/ResultStatus.tsx");
const resultsSource = read("src/renderer/results/ResultsView.tsx");
const gridSource = read("src/renderer/results/VirtualResultGrids.tsx");
const stableResultsStyles = read("src/renderer/stable-ui/StableSearchResults.css");
const resultSectionStyles = read("src/renderer/results/ResultSectionCard.css");
const foundationStyles = read("src/renderer/stable-ui/StableUiFoundation.css");
const navigationStateStyles = read("src/renderer/stable-ui/StableNavigationState.css");
const menuAdapterSource = read("src/renderer/results/ResultsContextMenuLayer.tsx");
const menuSource = read("src/renderer/results/ResponsiveResultsContextMenuLayer.tsx");
const sharedMenuSource = read("src/renderer/components/ResponsiveFileContextMenu.tsx");
const sharedMenuStyles = read("src/renderer/components/ResponsiveFileContextMenu.css");

assert.match(rendererEntry, /Promise\.all\(\[import\("\.\/App"\), import\("\.\/stable-ui\/StableUiRoot"\)\]\)/);
assert.match(rendererEntry, /<App stableUiRenderer=\{StableUiRoot\}\s*\/>/);
assert.match(appSource, /stableUiRenderer: StableUiRenderer/);
assert.match(appSource, /resultContent=\{\(active\) => <ResultsView key=\{search\.directoryId\} \{\.\.\.createResultsViewProps\(active\)\} \/>\}/);
assert.match(resultsSource, /active: boolean[\s\S]*?useEffect\(\(\) => \{[\s\S]*?if \(!active\) return undefined;[\s\S]*?window\.addEventListener\("keydown", handleKeyDown, true\)/u);
assert.match(appSource, /if \(selectedResultImageId\) \{[\s\S]*?setClearSelectionRequestId/u);
assert.doesNotMatch(appSource, /view === "results" && selectedResultImageId/u);
assert.match(appSource, /overlayContent=\{<>\{contextMenuLayer\}\{keywordEditorLayer\}\{deleteFilesPanel\}\{directoryDialogLayer\}<\/>\}/);
assert.match(appSource, /onSearch=\{submitSearch\}/);
const resultStatusCall = appSource.match(/const resultStatusNode = <ResultStatus[\s\S]*?\/>;/u)?.[0] ?? "";
assert.match(appSource, /const selectedDirectoryFileCount = directoryOptions\.find\(\(\{ id \}\) => id === search\.directoryId\)\?\.fileCount \?\? null;/u);
assert.match(resultStatusCall, /fileCount=\{selectedDirectoryFileCount\}/u);
assert.match(resultStatusCall, /hasActiveSearch=\{search\.query\.trim\(\)\.length > 0 \|\| search\.fileFormat !== "all"\}/u);
assert.doesNotMatch(resultStatusCall, /directoryId/u);
assert.match(resultStatusSource, /hasActiveSearch[\s\S]*?search\.resultCount[\s\S]*?search\.fileCount[\s\S]*?fileCount \?\? "…"/u);
assert.match(appSource, /const contentViewActivityConfirmed = useContentViewActivity\(cancelSearch\)/u);
assert.match(appSource, /if \(isLoadingDirectories \|\| !contentViewActivityConfirmed \|\| resultsInitializedRef\.current\) return;[\s\S]*?const initialSearch = \{ \.\.\.emptySearch, sortField: search\.sortField, sortDirection: search\.sortDirection \};[\s\S]*?runSearch\(initialSearch, \{ navigate: false \}\)[\s\S]*?\[contentViewActivityConfirmed, isLoadingDirectories\]/u);
assert.match(contentViewActivitySource, /setContentViewActive\(true\)\.then\(\(accepted\)[\s\S]*?setActivityConfirmed\(accepted === true\)/u);
assert.match(contentViewActivitySource, /if \(!active\) \{[\s\S]*?setActivityConfirmed\(false\)[\s\S]*?cancelSearch\(\)[\s\S]*?setContentViewActive\(false\)/u);
assert.match(contentViewActivitySource, /requestVersion !== requestVersionRef\.current \|\| !isDocumentActive\(\)/u);
assert.match(appSource, /const cycleSearchDirectory = \(\) => \{[\s\S]*?directoryOptions\.findIndex[\s\S]*?\(currentIndex \+ 1\) % directoryOptions\.length[\s\S]*?updateResultsSearchOptions/u);
assert.match(appSource, /const updateResultsSearch = \(nextSearch:[\s\S]*?nextSearch\.directoryId !== search\.directoryId[\s\S]*?resultScrollMemoryRef\.current = createInitialResultGridScrollMemory\(\)/u);
assert.match(appSource, /const searchResultsVisible = true;[\s\S]*?if \(\s*quickActionGlobalEnabled[\s\S]*?matchesShortcutEvent\(event, shortcutActions\.cycleDirectory\)[\s\S]*?cycleSearchDirectory\(\)/u);
assert.match(appSource, /onOpenImage: \(item\) => invokeFileAction\("open", item\)/);
assert.match(appSource, /onDeleteItems: requestDeleteFiles/);
assert.match(appSource, /onCopyPaths=\{\(items\)[\s\S]*?showQuickCommandNotice\(t\("clipboard\.copied"\)\)/u);
assert.match(menuAdapterSource, /<ResponsiveResultsContextMenuLayer \{\.\.\.props\} \/>/);
assert.doesNotMatch(menuAdapterSource, /LegacyResultsContextMenuLayer|state\.responsive/);
assert.doesNotMatch(rootSource, /window\.cap7ce|from "\.\.\/App"/);

for (const marker of [
  "onCompositionStart",
  "onCompositionEnd",
  "if (composingRef.current) return",
  "querySelector(\"input\")?.value ?? search.query",
  "onSearch({ ...search, query: submittedQuery })",
  "const clearedQuery = search.query.trim().length > 0"
]) assert.ok(inputSource.includes(marker), `Stable search input is missing ${marker}.`);
assert.match(inputSource, /placeholder=\{inputFeedback \|\| t\("search\.inputLabel"\)\}/u);
assert.doesNotMatch(inputSource, /cap-stable-search-feedback|is-showing-feedback/u);
assert.match(inputSource, /search\.query\.length > 0[\s\S]*?className="cap-stable-search-clear"[\s\S]*?query: ""[\s\S]*?onSearchChange\(nextSearch\); onSearchOptionsChange\(nextSearch\)[\s\S]*?focus\(\{ preventScroll: true \}\)/u);

assert.doesNotMatch(resultsSource, /responsiveLayout|shellState/);
assert.match(gridSource, /window\.matchMedia\("\(max-height: 359\.98px\)"\)/);
assert.match(gridSource, /layoutMode = lowHeightLayout \? "micro" : "normal"/);
assert.match(gridSource, /minimumColumnCount = 2/u);
assert.match(gridSource, /const EmptySearchResult = \(\{ message \}: \{ message: string \}\) => <div className="empty-result-row">\{message\}<\/div>/);
assert.match(stableResultsStyles, /\.cap-stable-results-slot \.thumb,[\s\S]*?\.result-section-card \{ border-radius: var\(--cap-stable-radius-sm\); background: var\(--cap-stable-grid-surface\); \}/u);
assert.match(resultSectionStyles, /\.result-section-card h2\s*\{[^}]*font-weight: 600;[^}]*color: var\(--text-main\);/u);
assert.match(resultSectionStyles, /\.result-section-card p\s*\{[^}]*color: color-mix\(in srgb, var\(--text-main\) 62%, transparent\);/u);
assert.doesNotMatch(resultSectionStyles, /animation:|@keyframes|cap7ce-ai-section-text-breathe/u);
assert.match(inputSource, /<StableUiIcon name="search" className="cap-stable-search-icon" \/>/u);
assert.match(foundationStyles, /\.cap-stable-search-slot[\s\S]*?background: var\(--cap-stable-search-surface\);/u);
assert.match(navigationStateStyles, /\.cap-stable-ui,[\s\S]*?\.cap-stable-titlebar,[\s\S]*?--cap-stable-navigation-state: rgb\(255 255 255 \/ 50%\);[\s\S]*?\.cap-stable-titlebar\.theme-dark,[\s\S]*?--cap-stable-navigation-state: rgb\(0 0 0 \/ 24%\);/u);
assert.match(stableResultsStyles, /\.cap-stable-search-slot input::placeholder \{ color: var\(--cap-stable-search-placeholder\); opacity: 1; \}/u);
assert.match(stableResultsStyles, /\.cap-stable-search-clear \{[^}]*width: 24px; height: 24px;[^}]*margin-right: -7px;[^}]*border-radius: 50%;[^}]*color: var\(--cap-stable-text\);[^}]*background: color-mix\(in srgb, currentColor 8%, transparent\);/u);
assert.match(stableResultsStyles, /\.cap-stable-search-clear:hover \{ background: color-mix\(in srgb, currentColor 14%, transparent\); \}[\s\S]*?\.cap-stable-search-clear-icon[^}]*width: 16px; height: 16px;/u);
assert.match(stableResultsStyles, /@container \(max-width: 180px\) \{ \.cap-stable-search-clear \{ display: none; \} \}/u);
assert.match(stableResultsStyles, /\.app \.cap-stable-search-slot input:focus,[\s\S]*?input:focus-visible \{ outline: 0; outline-offset: 0; box-shadow: none; \}/u);
assert.doesNotMatch(stableResultsStyles, /cap-stable-search-feedback|is-showing-feedback/u);

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
  directoryBrowsingFileCountLabelVerified: true,
  stableEmptyResultIsNotInteractive: true,
  formalVirtualResultsAndFileActionsReused: true,
  responsiveGridDirectionVerified: true,
  stableTwoColumnMinimumAndEightPixelRadiusVerified: true,
  stableSearchIconEmbedded: true
}));
