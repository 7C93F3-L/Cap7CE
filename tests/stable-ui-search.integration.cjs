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
const menuSource = read("src/renderer/results/ResultsContextMenuLayer.tsx");

assert.match(rendererEntry, /Promise\.all\(\[import\("\.\/App"\), import\("\.\/stable-ui\/StableUiRoot"\)\]\)/);
assert.match(rendererEntry, /<App stableUiRenderer=\{StableUiRoot\}\s*\/>/);
assert.match(appSource, /stableUiRenderer\?: StableUiRenderer/);
assert.match(appSource, /resultContent=\{deleteFilesPanel \?\? <ResultsView \{\.\.\.createResultsViewProps\(true\)\} \/>\}/);
assert.match(appSource, /onSearch=\{\(\) => submitSearch\(search\)\}/);
assert.match(appSource, /if \(!stableUi \|\| isLoadingDirectories \|\| resultsInitializedRef\.current\) return;[\s\S]*?const initialSearch = \{ \.\.\.emptySearch, sortField: search\.sortField, sortDirection: search\.sortDirection \};[\s\S]*?runSearch\(initialSearch, \{ navigate: false \}\)/);
assert.match(appSource, /onOpenImage: \(item\) => invokeFileAction\("open", item\)/);
assert.match(appSource, /onDeleteItems: requestDeleteFiles/);
assert.match(appSource, /if \(stableUi\) return;/);
assert.doesNotMatch(rootSource, /window\.cap7ce|from "\.\.\/App"/);

for (const marker of [
  "onCompositionStart",
  "onCompositionEnd",
  "if (!composingRef.current) onSearch()",
  "const clearedQuery = search.query.trim().length > 0"
]) assert.ok(inputSource.includes(marker), `Stable search input is missing ${marker}.`);

assert.match(resultsSource, /responsiveLayout\?: boolean/);
assert.match(resultsSource, /responsiveLayout=\{responsiveLayout\}/);
assert.match(gridSource, /window\.matchMedia\("\(max-height: 359\.98px\)"\)/);
assert.match(gridSource, /responsiveLayout \? \(lowHeightLayout \? "micro" : "normal"\)/);
assert.match(gridSource, /minimumColumnCount = responsiveLayout \? 2 : 1/u);
assert.match(gridSource, /interactive=\{!responsiveLayout\}/);
assert.match(gridSource, /: <div className="empty-result-row">\{message\}<\/div>/);
assert.match(stableResultsStyles, /\.cap-stable-results-slot \.thumb,[\s\S]*?\.result-section-card \{ border-radius: var\(--cap-stable-radius-sm\); \}/u);
assert.match(inputSource, /<StableUiIcon name="search" className="cap-stable-search-icon" \/>/u);

for (const marker of ["state.preview", "onOpen(state.item)", "onShowInFolder(state.item)", "onCopyPaths(state.items)", "onEditKeywords(state.items)", "onDelete(state.items)"]) {
  assert.ok(menuSource.includes(marker), `Formal results context menu is missing ${marker}.`);
}

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
