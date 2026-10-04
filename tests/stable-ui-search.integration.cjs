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
const exploreBarStyles = read("src/renderer/stable-ui/StableExploreBar.css");
const exploreFiltersSource = read("src/renderer/stable-ui/StableExploreFilters.tsx");
const exploreFiltersStyles = read("src/renderer/stable-ui/StableExploreFilters.css");
const fileSizeFilterSource = read("src/renderer/stable-ui/StableFileSizeFilter.tsx");
const fileSizeFilterStateSource = read("src/renderer/stable-ui/fileSizeFilterState.ts");
const exploreFormatFiltersSource = read("src/renderer/stable-ui/exploreFormatFilters.ts");
const exploreFormatSummarySource = read("src/renderer/stable-ui/exploreFormatSummary.ts");
const randomBrowseSource = read("src/renderer/explore/useRandomBrowse.ts");
const imageFiltersSource = read("src/renderer/stable-ui/StableImageFilters.tsx");
const videoFiltersSource = read("src/renderer/stable-ui/StableVideoFilters.tsx");
const videoColorFilterSource = read("src/renderer/stable-ui/StableVideoColorFilter.tsx");
const videoFilterStateSource = read("src/renderer/stable-ui/videoFilterState.ts");
const audioFiltersSource = read("src/renderer/stable-ui/StableAudioFilters.tsx");
const audioFilterStateSource = read("src/renderer/stable-ui/audioFilterState.ts");
const mediaFiltersSource = read("src/renderer/stable-ui/StableMediaFilters.tsx");
const mediaFilterStateSource = read("src/renderer/stable-ui/mediaFilterState.ts");
const documentFiltersSource = read("src/renderer/stable-ui/StableDocumentFilters.tsx");
const documentFilterStateSource = read("src/renderer/stable-ui/documentFilterState.ts");
const exploreTypeFilterStateSource = read("src/renderer/stable-ui/exploreTypeFilterState.ts");
const resultSectionStyles = read("src/renderer/results/ResultSectionCard.css");
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
assert.match(resultStatusCall, /hasActiveSearch=\{search\.query\.trim\(\)\.length > 0[\s\S]*?hasExploreTypeFilters\(search\)/u);
assert.match(resultStatusCall, /hasExploreTypeFilters\(search\)/u);
assert.doesNotMatch(resultStatusCall, /directoryId/u);
assert.match(resultStatusSource, /hasActiveSearch[\s\S]*?search\.resultCount[\s\S]*?search\.fileCount[\s\S]*?fileCount \?\? "…"/u);
assert.match(appSource, /const contentViewActivityConfirmed = useContentViewActivity\(cancelSearch\)/u);
assert.match(appSource, /if \(isLoadingDirectories \|\| !contentViewActivityConfirmed \|\| resultsInitializedRef\.current\) return;[\s\S]*?const initialSearch = \{ \.\.\.emptySearch, sortField: search\.sortField, sortDirection: search\.sortDirection \};[\s\S]*?runSearch\(initialSearch, \{ navigate: false \}\)[\s\S]*?\[contentViewActivityConfirmed, isLoadingDirectories\]/u);
assert.match(appSource, /await window\.cap7ce\?\.search\.images\(searchRequest, taskId\)[\s\S]*?const baseResults = Array\.isArray\(response\) \? response : response\.images;[\s\S]*?resultsInitializedRef\.current = true;[\s\S]*?setSearchResults/u);
assert.doesNotMatch(appSource, /setSearchError\(""\);\s*resultsInitializedRef\.current = true;/u);
assert.match(appSource, /const runSearch = async[\s\S]*?nextSearch\.query\.trim\(\) !== lastResultSearchRef\.current\.query\.trim\(\)[\s\S]*?resultScrollMemoryRef\.current = createInitialResultGridScrollMemory\(\)[\s\S]*?document\.querySelector<HTMLElement>\("\.cap-results-view \.image-grid"\)\?\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)[\s\S]*?lastResultSearchRef\.current = nextSearch/u);
assert.match(contentViewActivitySource, /setContentViewActive\(true\)\.then\(\(accepted\)[\s\S]*?setActivityConfirmed\(accepted === true\)/u);
assert.match(contentViewActivitySource, /const isDocumentVisible = \(\) => document\.visibilityState === "visible"/u);
assert.match(contentViewActivitySource, /if \(!active\) \{[\s\S]*?setActivityConfirmed\(false\)[\s\S]*?if \(!isDocumentVisible\(\)\) cancelSearch\(\)[\s\S]*?setContentViewActive\(false\)/u);
assert.match(contentViewActivitySource, /requestVersion !== requestVersionRef\.current \|\| !isDocumentActive\(\)/u);
assert.match(appSource, /useSearchIndexRefresh\(\(force\) => \{\s*if \(\s*!contentViewActivityConfirmed[\s\S]*?!resultsInitializedRef\.current[\s\S]*?!lastResultSearchRef\.current\.query\.trim\(\)/u);
assert.match(appSource, /const cycleSearchDirectory = \(\) => \{[\s\S]*?directoryOptions\.findIndex[\s\S]*?\(currentIndex \+ 1\) % directoryOptions\.length[\s\S]*?updateResultsSearchOptions/u);
assert.match(appSource, /const updateResultsSearch = \(nextSearch:[\s\S]*?nextSearch\.directoryId !== search\.directoryId[\s\S]*?resultScrollMemoryRef\.current = createInitialResultGridScrollMemory\(\)/u);
assert.match(appSource, /const searchResultsVisible = true;[\s\S]*?if \(\s*quickActionGlobalEnabled[\s\S]*?matchesShortcutEvent\(event, shortcutActions\.cycleDirectory\)[\s\S]*?cycleSearchDirectory\(\)/u);
assert.match(appSource, /onOpenImage: \(item\) => invokeFileAction\("open", item\)/);
assert.match(appSource, /onDeleteItems: requestDeleteFiles/);
assert.match(appSource, /onCopyPaths=\{\(items\)[\s\S]*?copyFilePathsWithFeedback\(items\.map[\s\S]*?t\("clipboard\.copied"\), showQuickCommandNotice\)/u);
assert.match(menuAdapterSource, /<ResponsiveResultsContextMenuLayer \{\.\.\.props\} \/>/);
assert.doesNotMatch(menuAdapterSource, /LegacyResultsContextMenuLayer|state\.responsive/);
assert.doesNotMatch(rootSource, /window\.cap7ce|from "\.\.\/App"/);
assert.match(exploreFiltersSource, /timePresets = \["week", "month", "year", "last-year", "older", "all"\]/u);
assert.match(exploreFiltersSource, /timePreset: "custom", modifiedTimeRange: \{ startMs, endMs:/u);
assert.match(exploreFiltersSource, /selectedExtensions: nextExtensions\.length \? nextExtensions : undefined/u);
assert.match(exploreFiltersSource, /const scrollFiltersHorizontally = [\s\S]*?rail\.scrollLeft \+= delta/u);
assert.match(exploreFiltersSource, /className="cap-stable-explore-filters" onWheel=\{scrollFiltersHorizontally\}/u);
assert.match(exploreFiltersSource, /className="cap-stable-file-type-filter"[\s\S]*?<StableMediaFilters/u);
assert.match(exploreFiltersSource, /className="cap-stable-file-type-filter"[\s\S]*?<StableFileSizeFilter[\s\S]*?<StableMediaFilters/u);
assert.match(fileSizeFilterSource, /under-1mb[\s\S]*?1mb-10mb[\s\S]*?10mb-100mb[\s\S]*?100mb-1gb[\s\S]*?1gb-or-more/u);
assert.match(fileSizeFilterSource, /explore\.minimumFileSize[\s\S]*?explore\.maximumFileSize[\s\S]*?\["KB", "MB", "GB"\]/u);
assert.match(fileSizeFilterStateSource, /fileSizePreset: undefined, fileSizeRange: undefined[\s\S]*?Boolean\(search\.fileSizePreset \|\| search\.fileSizeRange\)/u);
assert.match(mediaFiltersSource, /<StableImageFilters[\s\S]*?<StableVideoFilters[\s\S]*?<StableAudioFilters/u);
assert.match(exploreFiltersSource, /useLayoutEffect\(\(\) => setFlyout\(null\), \[closeFlyoutRequest\]\)/u);
assert.match(exploreFiltersSource, /if \(nextFlyout\) onFlyoutOpen\(\)/u);
assert.match(exploreFiltersSource, /if \(search\.timePreset === timePreset && !search\.modifiedTimeRange\) return/u);
assert.match(exploreFiltersSource, /onPointerCancel[\s\S]*?timeAdjustmentKeys\.has\(event\.key\)/u);
assert.doesNotMatch(exploreFiltersSource, /onBlur=\{\(event\) => commitTime/u);
assert.match(exploreFormatFiltersSource, /getExtensionsForCanonicalFormat[\s\S]*?canonicalFormat\(capability\.extension\) === canonicalFormat\(format\)/u);
assert.match(exploreFormatFiltersSource, /isImageOnlyExtensionSelection[\s\S]*?extension !== "\.pdf"[\s\S]*?category === "visual"/u);
assert.match(exploreFormatFiltersSource, /isVideoOnlyExtensionSelection[\s\S]*?category === "video"/u);
assert.match(exploreFormatFiltersSource, /isAudioOnlyExtensionSelection[\s\S]*?category === "audio"/u);
assert.match(exploreFormatFiltersSource, /isDocumentOnlyExtensionSelection[\s\S]*?extension === "\.pdf"[\s\S]*?category === "document"/u);
assert.match(exploreFormatSummarySource, /canonicalizeSelectedFormats\(extensions\)\.length < 2[\s\S]*?kind: "type"[\s\S]*?kind: "format"/u);
assert.match(randomBrowseSource, /scorePath\(left\.filePath, seed\)[\s\S]*?state\.enabled \? orderRandomBrowseItems\(items, state\.seed\)/u);
assert.match(randomBrowseSource, /current\.seed \+ 1[\s\S]*?batchNumber: current\.batchNumber \+ 1/u);
assert.doesNotMatch(randomBrowseSource, /Math\.random/u);
assert.match(appSource, /active, images: randomBrowse\.items/u);
assert.match(appSource, /clearExploreTypeFilters\(\{ \.\.\.search, fileFormat: "all"[\s\S]*?selectedExtensions: undefined[\s\S]*?timePreset: "all"/u);
assert.match(imageFiltersSource, /if \(!isImageOnlyExtensionSelection[\s\S]*?return null[\s\S]*?StableImageColorFilter[\s\S]*?StableImageRatioFilter[\s\S]*?StableImageDimensionFilter[\s\S]*?StableImageAnimationFilter/u);
assert.match(videoFiltersSource, /if \(!isVideoOnlyExtensionSelection[\s\S]*?return null[\s\S]*?explore\.videoDuration[\s\S]*?explore\.videoRatios[\s\S]*?explore\.videoResolution[\s\S]*?StableVideoColorFilter/u);
assert.match(videoFiltersSource, /videoDurationPreset:[\s\S]*?videoDurationRange: undefined/u);
assert.match(videoColorFilterSource, /searchVideoVisualColors[\s\S]*?videoVisualColors:[\s\S]*?searchVideoColorTraits[\s\S]*?videoColorTraits:/u);
assert.match(videoFilterStateSource, /videoDurationPreset: undefined[\s\S]*?videoAspectRatios: undefined[\s\S]*?videoResolutions: undefined[\s\S]*?videoVisualColors: undefined[\s\S]*?videoColorTraits: undefined/u);
assert.match(audioFiltersSource, /if \(!isAudioOnlyExtensionSelection[\s\S]*?return null[\s\S]*?explore\.audioDuration[\s\S]*?explore\.audioChannels/u);
assert.match(audioFiltersSource, /audioDurationPreset:[\s\S]*?audioDurationRange: undefined[\s\S]*?audioChannels:/u);
assert.match(audioFilterStateSource, /audioDurationPreset: undefined[\s\S]*?audioDurationRange: undefined[\s\S]*?audioChannels: undefined/u);
assert.match(mediaFilterStateSource, /clearAudioFilters\(clearVideoFilters\(clearImageFilters\(search\)\)\)[\s\S]*?hasImageFilters\(search\) \|\| hasVideoFilters\(search\) \|\| hasAudioFilters\(search\)[\s\S]*?retainApplicableMediaFilters/u);
assert.match(documentFiltersSource, /isDocumentOnlyExtensionSelection[\s\S]*?explore\.documentContentCount[\s\S]*?documentContentCountPreset:[\s\S]*?documentContentCountRange:/u);
assert.match(documentFilterStateSource, /documentContentCountPreset: undefined[\s\S]*?documentContentCountRange: undefined/u);
assert.match(exploreTypeFilterStateSource, /clearDocumentFilters\(clearMediaFilters\(search\)\)[\s\S]*?hasMediaFilters\(search\) \|\| hasDocumentFilters\(search\)[\s\S]*?retainApplicableMediaFilters/u);
assert.match(exploreFiltersStyles, /cap-stable-time-rails i:nth-child\(1\)[^}]*width: 40%[\s\S]*?nth-child\(2\)[^}]*left: 60%[\s\S]*?nth-child\(3\)[^}]*right: 0/u);

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
assert.match(exploreBarStyles, /\.cap-stable-explore-bar \.cap-stable-search-slot[\s\S]*?background: var\(--cap-stable-search-surface\);/u);
assert.match(navigationStateStyles, /\.cap-stable-ui,[\s\S]*?\.cap-stable-titlebar,[\s\S]*?--cap-stable-navigation-state: rgb\(255 255 255 \/ 50%\);[\s\S]*?\.cap-stable-titlebar\.theme-dark,[\s\S]*?--cap-stable-navigation-state: rgb\(0 0 0 \/ 24%\);/u);
assert.match(stableResultsStyles, /\.cap-stable-search-slot input::placeholder \{ color: var\(--cap-stable-search-placeholder\); opacity: 1; \}/u);
assert.match(stableResultsStyles, /\.cap-stable-search-clear \{[^}]*width: 24px; height: 24px;[^}]*margin-right: -7px;[^}]*border-radius: 50%;[^}]*color: var\(--cap-stable-text\);[^}]*background: var\(--cap-stable-hover\);[^}]*transition: var\(--cap-stable-control-transition\);/u);
assert.match(stableResultsStyles, /\.cap-stable-search-clear:hover \{ background: var\(--cap-stable-control-hover\); \}[\s\S]*?\.cap-stable-search-clear:active \{ background: var\(--cap-stable-control-pressed\); \}[\s\S]*?\.cap-stable-search-clear-icon[^}]*width: 16px; height: 16px;/u);
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
assert.match(sharedMenuStyles, /border-radius: 999px[\s\S]*background: var\(--context-menu-control-hover\)[\s\S]*background: var\(--context-menu-control-pressed\)/);
assert.doesNotMatch(sharedMenuStyles, /button:hover:not\(:disabled\)[^}]*linear-gradient/u);
assert.match(sharedMenuStyles, /font-family:\s*var\(--cap-ui-font-family\)[\s\S]*?font-size:\s*var\(--cap-ui-font-body\)/u);

console.log(JSON.stringify({
  singleSearchAuthorityBridged: true,
  imeAndClearSubmissionGuarded: true,
  changedOrClearedSearchReturnsToCurrentDirectoryTop: true,
  visibleUnfocusedSearchPreserved: true,
  unfocusedIndexRefreshSuppressed: true,
  stableInitialAllDirectorySearchVerified: true,
  directoryBrowsingFileCountLabelVerified: true,
  stableEmptyResultIsNotInteractive: true,
  formalVirtualResultsAndFileActionsReused: true,
  responsiveGridDirectionVerified: true,
  stableTwoColumnMinimumAndEightPixelRadiusVerified: true,
  stableSearchIconEmbedded: true
}));
