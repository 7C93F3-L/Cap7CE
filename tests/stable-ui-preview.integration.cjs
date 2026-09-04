const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const mainSource = read("electron/main.ts");
const previewSource = read("src/renderer/PreviewWindowApp.tsx");
const titlebarSource = read("src/renderer/preview/StablePreviewTitlebar.tsx");
const titlebarStyles = read("src/renderer/preview/StablePreviewTitlebar.css");
const sidebarSource = read("src/renderer/preview/PreviewInformationSidebar.tsx");
const manualKeywordsSectionSource = read("src/renderer/preview/PreviewManualKeywordsSection.tsx");
const keywordEditorSource = read("src/renderer/keywords/KeywordTagEditor.tsx");
const keywordEditorStyles = read("src/renderer/keywords/KeywordTagEditor.css");
const manualMetadataRuntimeSource = read("electron/manualMetadataRuntime.ts");
const layoutSource = read("src/renderer/preview/usePreviewSidebarLayout.ts");
const keyboardSource = read("src/renderer/preview/previewSidebarKeyboard.ts");
const shellStyles = read("src/renderer/preview/StablePreviewShell.css");
const sidebarStyles = read("src/renderer/preview/StablePreviewSidebar.css");
const accessibilityStyles = read("src/renderer/preview/StablePreviewAccessibility.css");
const responsiveStyles = read("src/renderer/preview/StablePreviewResponsive.css");
const resultsSource = read("src/renderer/results/ResultsView.tsx");
const sidebarDataSource = read("src/renderer/preview/previewSidebarData.ts");
const navigationTargetSource = read("src/renderer/preview/previewNavigationTarget.ts");

assert.match(mainSource, /const previewUrl = new URL\(devServerUrl\);[\s\S]*?previewUrl\.searchParams\.set\("window", "preview"\);[\s\S]*?previewUrl\.searchParams\.set\("presentation", windowPresentationRuntime\.mode\)/u);
assert.match(mainSource, /query: \{ window: "preview", presentation: windowPresentationRuntime\.mode \}/u);
assert.match(previewSource, /const isStableUiPreview = new URLSearchParams\(window\.location\.search\)\.get\("presentation"\) === "stable"/u);
assert.match(previewSource, /isStableUiPreview && <PreviewInformationSidebar/u);
assert.match(previewSource, /isStableUiPreview && <StablePreviewTitlebar/u);
assert.match(previewSource, /!isStableUiPreview && <WindowControlRail/u);
assert.match(titlebarSource, /<WindowTitlebarPortal>[\s\S]*?<header/u);
assert.match(titlebarSource, /<WindowPinButton/u);
assert.match(titlebarStyles, /\.preview-stable-titlebar\s*\{[\s\S]*?app-region: drag;/u);
assert.match(titlebarStyles, /\.preview-stable-titlebar-pin\s*\{[\s\S]*?app-region: no-drag;/u);
assert.match(titlebarStyles, /\.preview-stable-titlebar-pin-icon\s*\{[\s\S]*?width: 24px;[\s\S]*?height: 24px;/u);
assert.match(previewSource, /isPreviewNavigationSuppressedTarget/u);
assert.match(navigationTargetSource, /data-preview-navigation-suppressed/u);
assert.match(previewSource, /!isStableUiPreview && previewData\.embeddedMetadata[\s\S]*?variant="sheet"/u);

assert.match(resultsSource, /buildPreviewSidebarData\(image\)/u);
assert.match(sidebarDataSource, /manualKeywords: item\.keywords/u);
assert.match(sidebarDataSource, /userDescription: item\.userDescription/u);
assert.match(sidebarDataSource, /searchEvidence: item\.searchEvidence/u);
assert.match(sidebarSource, /PreviewEmbeddedMetadata[\s\S]*?variant="details"/u);
assert.match(sidebarSource, /<PreviewManualKeywordsSection[\s\S]*?manualKeywords=\{data\.manualKeywords \?\? \[\]\}[\s\S]*?onSave=\{onSaveKeywords\}/u);
assert.match(manualKeywordsSectionSource, /<KeywordTagEditor[\s\S]*?initialKeywords=\{manualKeywords\}[\s\S]*?onSave=\{onSave\}/u);
assert.match(manualKeywordsSectionSource, /editorOpen \? "preview\.sidebar\.clearKeywords" : "context\.editKeywords"/u);
assert.match(manualKeywordsSectionSource, /setClearRequestVersion\(\(version\) => version \+ 1\)/u);
assert.match(keywordEditorSource, /parseKeywordText\(inputValue\)[\s\S]*?normalizeKeywordList/u);
assert.match(keywordEditorSource, /clearRequestVersionRef[\s\S]*?setKeywords\(\[\]\)[\s\S]*?setInputValue\(""\)/u);
assert.match(keywordEditorSource, /onCompositionStart[\s\S]*?onCompositionEnd[\s\S]*?nativeEvent\.isComposing/u);
assert.match(keywordEditorSource, /event\.key !== "Escape"[\s\S]*?event\.stopPropagation\(\)[\s\S]*?onCancel\(\)/u);
assert.match(keywordEditorStyles, /keyword-tag-editor-tag[\s\S]*?border-radius: 999px/u);
assert.match(keywordEditorStyles, /keyword-tag-editor-entry input:focus-visible \{ outline: 0; \}/u);
assert.match(keywordEditorStyles, /keyword-tag-editor-actions button:not\(:disabled\):hover \{ color: var\(--preview-action-hover-text\); background: linear-gradient\(45deg, var\(--theme-color\) 0%, var\(--accent-color\) 100%\); \}/u);
assert.match(sidebarSource, /data-preview-navigation-suppressed="true"/u);
assert.match(sidebarSource, /preview-sidebar-section preview-sidebar-file-card[\s\S]*?preview-sidebar-file-heading[\s\S]*?preview-sidebar-details/u);
assert.match(sidebarSource, /className="preview-sidebar-path"[\s\S]*?onClick=\{onShowInFolder\}/u);
assert.match(sidebarSource, /<CustomScrollbar scrollContainerRef=\{scrollRef\} orientation="vertical" \/>/u);
assert.doesNotMatch(sidebarSource, /window\.cap7ce/u);

assert.match(layoutSource, /cap7ce\.preview\.sidebar-layout\.v1/u);
assert.match(keyboardSource, /previewSidebarMinimumWidth = 280/u);
assert.match(keyboardSource, /previewSidebarMaximumWidth = 420/u);
assert.match(layoutSource, /previewSidebarDefaultWidth = 320/u);
assert.match(keyboardSource, /new Set\(\["Home", "End", "ArrowLeft", "ArrowRight"\]\)\.has\(event\.key\)/u);
assert.match(keyboardSource, /event\.key === "ArrowLeft"[\s\S]*?currentWidth - 8[\s\S]*?currentWidth \+ 8/u);
assert.match(sidebarSource, /aria-label=\{t\(expanded \? "preview\.sidebar\.collapse" : "preview\.sidebar\.expand"\)\}/u);
assert.match(sidebarSource, /onPointerUp=\{\(event\) => event\.currentTarget\.blur\(\)\}/u);
assert.doesNotMatch(sidebarSource, /canShowSecondaryActions|onOpenSkim|onOpenSettings|preview-sidebar-secondary-actions/u);
assert.doesNotMatch(previewSource, /canShowSecondaryActions=\{showSettings\}/u);
assert.match(sidebarSource, /role="separator"[\s\S]*?tabIndex=\{0\}[\s\S]*?aria-valuenow=\{width\}[\s\S]*?onKeyDown=\{onResizeByKeyboard\}/u);
assert.match(shellStyles, /@import "\.\/StablePreviewSidebar\.css"/u);
assert.match(shellStyles, /preview-information-sidebar\.is-collapsed[\s\S]*?40px/u);
assert.match(sidebarStyles, /preview-sidebar-section\s*\{[\s\S]*?border-radius: 22px;[\s\S]*?background: var\(--preview-sidebar-card\)/u);
assert.match(sidebarStyles, /--preview-sidebar-card: rgb\(255 255 255 \/ 60%\)/u);
assert.match(sidebarStyles, /preview-sidebar-actions\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/u);
assert.match(sidebarStyles, /preview-sidebar-actions button:hover \{ color: var\(--preview-action-hover-text\); background: linear-gradient\(45deg, var\(--theme-color\) 0%, var\(--accent-color\) 100%\); \}/u);
assert.match(sidebarStyles, /preview-sidebar-section-heading button \{[\s\S]*?color: var\(--preview-sidebar-muted\)/u);
assert.match(sidebarStyles, /preview-sidebar-section-heading button:not\(:disabled\):hover \{ color: var\(--theme-color\); \}/u);
assert.match(sidebarStyles, /preview-sidebar-keywords span \{ min-width: 40px; text-align: center; \}/u);
assert.match(sidebarStyles, /preview-sidebar-path:hover \{ color: var\(--theme-color\); \}/u);
assert.match(previewSource, /--preview-action-hover-text": getTextColorForBackground\(previewData\.appearanceColors\.themeColor, previewData\.appearanceColors\.accentColor\)/u);
assert.match(previewSource, /index\.updateManualKeywords\([\s\S]*?previewData\.filePath[\s\S]*?keywords\.join\(","\)[\s\S]*?manualKeywords: normalizedKeywords/u);
assert.match(manualMetadataRuntimeSource, /isSingleSenderAllowed: \(event, filePath\)[\s\S]*?event\.sender === previewWindow\.webContents[\s\S]*?activePreviewData\.filePath/u);
assert.match(manualMetadataRuntimeSource, /manualKeywords: keywords[\s\S]*?preview:manualKeywordsUpdated/u);
assert.doesNotMatch(sidebarSource, /className="is-danger"/u);
assert.match(sidebarStyles, /\.preview-sidebar-scroll::-webkit-scrollbar \{ width: 0; height: 0; \}/u);
assert.match(sidebarStyles, /\.preview-information-sidebar > \.cap-custom-scrollbar-vertical \{ position: absolute; top: 58px; right: 4px; bottom: 0;/u);
assert.match(titlebarStyles, /\.preview-window-stable-ui\s*\{[\s\S]*?border: 0;[\s\S]*?border-radius: 0;/u);
assert.match(shellStyles, /\.preview-stable-shell \.preview-window-content[\s\S]*?inset: 0 5px 5px 0/u);
assert.match(mainSource, /minimizable: isStableWindowPresentationMode\(windowPresentationRuntime\.mode\)/u);
assert.match(mainSource, /isStableWindowPresentationMode\(windowPresentationRuntime\.mode\) \? getStablePreviewContentChrome\(sidebarWidth\) : \{\}/u);
assert.match(previewSource, /previewSidebarWidth = isStableUiPreview \? \(previewSidebarLayout\.expanded \? previewSidebarLayout\.width : 40\) : undefined/u);
assert.match(previewSource, /preview\.contentSize\(\{[\s\S]*?sidebarWidth: previewSidebarWidth/u);
assert.match(shellStyles, /\.preview-stable-shell \.preview-window-content\s*\{[\s\S]*?inset: 0 5px 5px 0;/u);
assert.match(shellStyles, /\.preview-window-stable-ui\s*\{[\s\S]*?font-family:\s*var\(--cap-ui-font-family\)[\s\S]*?font-size:\s*var\(--cap-ui-font-body\)/u);
assert.match(sidebarStyles, /preview-sidebar-file-heading strong[^\n]*font-size:\s*var\(--cap-ui-font-heading\)/u);
assert.match(shellStyles, /--preview-stable-surface: rgb\(255 255 255 \/ 50%\)[\s\S]*?theme-dark[\s\S]*?rgb\(26 26 26 \/ 58%\)[\s\S]*?background: var\(--preview-stable-surface\)/u);
assert.match(mainSource, /skipTaskbar: !isStableWindowPresentationMode\(windowPresentationRuntime\.mode\)/u);
assert.match(mainSource, /previewWindow\.setSkipTaskbar\(!isStableWindowPresentationMode\(windowPresentationRuntime\.mode\)\)/u);
assert.match(responsiveStyles, /@media \(max-width: 640px\)[\s\S]*?calc\(100vw - 220px\)/u);
assert.match(accessibilityStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.preview-window-stable-ui \*/u);

console.log(JSON.stringify({
  formalStablePreviewEntryPresent: true,
  stablePreviewTitlebarAndNativeMinimizePresent: true,
  stablePreviewNativeTaskbarMinimizePresent: true,
  stablePreviewSingleWindowSurfacePresent: true,
  legacyPreviewFallbackPreserved: true,
  singleProviderLifecyclePreserved: true,
  formalInformationSidebarPresent: true,
  cardBasedInformationLayoutVerified: true,
  embeddedMetadataMovedWithoutStableDuplication: true,
  sidebarLayoutPersistenceBounded: true,
  sidebarScrollNavigationSuppressed: true,
  existingFileActionsReused: true,
  keyboardSidebarResizeVerified: true,
  narrowPreviewAndReducedMotionVerified: true
}));
