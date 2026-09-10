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
const searchEvidenceSource = read("src/renderer/preview/PreviewSearchEvidence.tsx");
const searchEvidenceStyles = read("src/renderer/preview/PreviewSearchEvidence.css");
const embeddedMetadataSource = read("src/renderer/preview/PreviewEmbeddedMetadata.tsx");
const embeddedMetadataStyles = read("src/renderer/preview/PreviewEmbeddedMetadata.css");
const manualKeywordsSectionSource = read("src/renderer/preview/PreviewManualKeywordsSection.tsx");
const keywordEditorSource = read("src/renderer/keywords/KeywordTagEditor.tsx");
const keywordEditorStyles = read("src/renderer/keywords/KeywordTagEditor.css");
const manualMetadataRuntimeSource = read("electron/manualMetadataRuntime.ts");
const layoutSource = read("src/renderer/preview/usePreviewSidebarLayout.ts");
const shellStyles = read("src/renderer/preview/StablePreviewShell.css");
const fileInfoStyles = read("src/renderer/preview/StablePreviewFileInfo.css");
const providerStyles = read("src/renderer/preview/StablePreviewProviders.css");
const sidebarStyles = read("src/renderer/preview/StablePreviewSidebar.css");
const accessibilityStyles = read("src/renderer/preview/StablePreviewAccessibility.css");
const navigationStateStyles = read("src/renderer/stable-ui/StableNavigationState.css");
const materialContrastStyles = read("src/renderer/stable-ui/StableMaterialContrast.css");
const resultsSource = read("src/renderer/results/ResultsView.tsx");
const sidebarDataSource = read("src/renderer/preview/previewSidebarData.ts");
const navigationTargetSource = read("src/renderer/preview/previewNavigationTarget.ts");

assert.match(mainSource, /const previewUrl = new URL\(devServerUrl\);[\s\S]*?previewUrl\.searchParams\.set\("window", "preview"\)/u);
assert.match(mainSource, /query: \{ window: "preview" \}/u);
assert.doesNotMatch(mainSource, /presentationMode|windowPresentationRuntime/u);
assert.match(previewSource, /<PreviewInformationSidebar/u);
assert.match(previewSource, /<StablePreviewTitlebar/u);
assert.doesNotMatch(previewSource, /isStableUiPreview|isCompatibilityWindow|WindowControlRail|CompatibilityTitlebar/u);
assert.match(titlebarSource, /<WindowTitlebarPortal>[\s\S]*?<header/u);
assert.match(titlebarSource, /<WindowPinButton/u);
assert.match(titlebarStyles, /\.preview-stable-titlebar\s*\{[\s\S]*?app-region: drag;/u);
assert.match(titlebarStyles, /\.preview-stable-titlebar-pin\s*\{[\s\S]*?app-region: no-drag;/u);
assert.match(titlebarStyles, /\.preview-stable-titlebar-pin-icon\s*\{[\s\S]*?width: 24px;[\s\S]*?height: 24px;/u);
assert.match(previewSource, /isPreviewNavigationSuppressedTarget/u);
assert.match(navigationTargetSource, /data-preview-navigation-suppressed/u);
assert.doesNotMatch(previewSource, /embeddedMetadataExpanded|variant="sheet"/u);

assert.match(resultsSource, /buildPreviewSidebarData\(image\)/u);
assert.match(sidebarDataSource, /manualKeywords: item\.keywords/u);
assert.match(sidebarDataSource, /userDescription: item\.userDescription/u);
assert.match(sidebarDataSource, /searchEvidence: item\.searchEvidence/u);
assert.match(sidebarSource, /<PreviewEmbeddedMetadata key=\{data\.sessionId\} data=\{data\.embeddedMetadata\} \/>/u);
assert.match(sidebarSource, /<PreviewSearchEvidence evidence=\{data\.searchEvidence\} skimActive=\{data\.skimActive\} \/>/u);
for (const marker of ["fileName", "relativeDirectory", "embeddedMetadata", "aiCaption", "visualPropertySoft"]) {
  assert.ok(searchEvidenceSource.includes(`${marker}: \"preview.evidence.`), `Preview evidence label mapping is missing ${marker}.`);
}
assert.match(searchEvidenceSource, /new Map<SearchEvidenceSource, string\[\]>\(\)[\s\S]*?grouped\.get\(bestSource\)[\s\S]*?!terms\.includes\(term\)[\s\S]*?grouped\.set\(bestSource, terms\)/u);
assert.match(searchEvidenceSource, /terms\.join\(t\("preview\.evidence\.termSeparator"\)\)/u);
assert.match(searchEvidenceStyles, /preview-sidebar-evidence li\s*\{[\s\S]*?grid-template-columns: minmax\(72px, \.55fr\) minmax\(0, 1fr\)[\s\S]*?background: var\(--preview-sidebar-control\)/u);
assert.match(embeddedMetadataSource, /isVisualContent: item\.kind === "visual_content"[\s\S]*?className=\{row\.isVisualContent \? "is-visual-content" : undefined\}/u);
assert.match(embeddedMetadataStyles, /preview-embedded-metadata-list > div\.is-visual-content \{ grid-template-columns: minmax\(0, 1fr\); gap: 0; \}[\s\S]*?div\.is-visual-content dt \{ display: none; \}/u);
assert.match(sidebarSource, /<PreviewManualKeywordsSection[\s\S]*?manualKeywords=\{data\.manualKeywords \?\? \[\]\}[\s\S]*?onSave=\{onSaveKeywords\}/u);
assert.match(manualKeywordsSectionSource, /<KeywordTagEditor[\s\S]*?initialKeywords=\{manualKeywords\}[\s\S]*?onSave=\{onSave\}/u);
assert.match(manualKeywordsSectionSource, /editorOpen \? "preview\.sidebar\.clearKeywords" : "context\.editKeywords"/u);
assert.match(manualKeywordsSectionSource, /setClearRequestVersion\(\(version\) => version \+ 1\)/u);
assert.match(keywordEditorSource, /parseKeywordText\(inputValue\)[\s\S]*?normalizeKeywordList/u);
assert.match(keywordEditorSource, /clearRequestVersionRef[\s\S]*?setKeywords\(\[\]\)[\s\S]*?setInputValue\(""\)/u);
assert.match(keywordEditorSource, /onCompositionStart[\s\S]*?onCompositionEnd[\s\S]*?nativeEvent\.isComposing/u);
assert.match(keywordEditorSource, /event\.key !== "Escape"[\s\S]*?event\.stopPropagation\(\)[\s\S]*?onCancel\(\)/u);
assert.match(keywordEditorSource, /icon-stable-clear-search\.svg\?raw[\s\S]*?<SvgIcon[^>]*keyword-tag-editor-remove-icon/u);
assert.doesNotMatch(keywordEditorSource, />×</u);
assert.match(keywordEditorStyles, /keyword-tag-editor-tag[\s\S]*?border-radius: 999px/u);
assert.match(keywordEditorStyles, /keyword-tag-editor-remove-icon \{ width: 12px; height: 12px; \}/u);
assert.match(keywordEditorStyles, /keyword-tag-editor-entry input:focus-visible \{ outline: 0; \}/u);
assert.match(keywordEditorStyles, /keyword-tag-editor-actions button:not\(:disabled\):hover \{ color: var\(--preview-action-hover-text\); background: var\(--cap-accent-gradient\); \}/u);
assert.match(sidebarSource, /data-preview-navigation-suppressed="true"/u);
assert.match(sidebarSource, /preview-sidebar-section preview-sidebar-file-card[\s\S]*?preview-sidebar-file-heading[\s\S]*?preview-sidebar-details/u);
assert.match(sidebarSource, /className="preview-sidebar-path"[\s\S]*?onClick=\{onShowInFolder\}/u);
assert.match(sidebarSource, /<CustomScrollbar scrollContainerRef=\{scrollRef\} orientation="vertical" \/>/u);
assert.doesNotMatch(sidebarSource, /window\.cap7ce/u);
assert.match(previewSource, /useTransientFeedback\(1800\)[\s\S]*?copyPathCopied=\{copiedPreviewSessionId === previewData\.sessionId\}/u);
assert.match(sidebarSource, /t\(copyPathCopied \? "clipboard\.copied" : "context\.copyPath"\)/u);

assert.match(layoutSource, /cap7ce\.preview\.sidebar-layout\.v1/u);
assert.match(layoutSource, /previewSidebarExpandedWidth = 280/u);
assert.match(layoutSource, /JSON\.stringify\(\{ expanded \}\)/u);
assert.doesNotMatch(layoutSource, /setWidth|pointermove|resizeByKeyboard|resetWidth/u);
assert.match(sidebarSource, /aria-label=\{t\(expanded \? "preview\.sidebar\.collapse" : "preview\.sidebar\.expand"\)\}/u);
assert.match(sidebarSource, /onPointerUp=\{\(event\) => event\.currentTarget\.blur\(\)\}/u);
assert.doesNotMatch(sidebarSource, /canShowSecondaryActions|onOpenSkim|onOpenSettings|preview-sidebar-secondary-actions/u);
assert.doesNotMatch(previewSource, /canShowSecondaryActions=\{showSettings\}/u);
assert.doesNotMatch(sidebarSource, /preview-sidebar-resize-handle|role="separator"|onBeginResize|onResizeByKeyboard|onResetWidth/u);
assert.doesNotMatch(sidebarStyles, /is-resizing-preview-sidebar/u);
assert.match(shellStyles, /@import "\.\/StablePreviewSidebar\.css"/u);
assert.match(shellStyles, /preview-information-sidebar\.is-collapsed[\s\S]*?40px/u);
assert.match(shellStyles, /--preview-sidebar-current-width: var\(--preview-sidebar-width, 280px\)/u);
assert.match(sidebarStyles, /preview-sidebar-section\s*\{[\s\S]*?border-radius: 22px;[\s\S]*?background: var\(--preview-sidebar-card\)/u);
assert.match(sidebarStyles, /--preview-sidebar-card: var\(--preview-stable-card\)/u);
assert.match(fileInfoStyles, /\.preview-window-stable-ui \{[^}]*--preview-heading-text: #111111;/u);
assert.match(fileInfoStyles, /\.preview-window-stable-ui\.theme-dark \{[^}]*--preview-heading-text: #d8d8d8;/u);
assert.match(sidebarStyles, /\.preview-sidebar-header \{[^}]*color: var\(--preview-heading-text, var\(--text-main\)\);/u);
assert.doesNotMatch(sidebarStyles, /theme-dark \.preview-sidebar-header/u);
assert.match(shellStyles, /^@import "\.\.\/stable-ui\/StableNavigationState\.css";\s*@import "\.\.\/stable-ui\/StableMaterialContrast\.css";/u);
assert.doesNotMatch(previewSource, /StableMaterialContrast\.css/u);
assert.match(navigationStateStyles, /\.preview-window-stable-ui \{[\s\S]*?--cap-stable-hover:[\s\S]*?--cap-stable-control-hover:[\s\S]*?--cap-stable-control-transition:/u);
assert.match(sidebarStyles, /\.preview-sidebar-header \{[^}]*transition: var\(--cap-stable-control-transition\);[^}]*\}[\s\S]*?\.preview-sidebar-header:where\(:hover, :focus-visible\) \{ background: var\(--cap-stable-hover\); \}[\s\S]*?\.preview-sidebar-header:active \{ background: var\(--cap-stable-control-hover\); \}/u);
assert.match(materialContrastStyles, /\.preview-window-stable-ui\.theme-dark\[data-window-material="acrylic"\] \{[^}]*--cap-stable-control-hover: rgb\(255 255 255 \/ 18%\);[^}]*--cap-stable-control-pressed: rgb\(255 255 255 \/ 24%\);/u);
assert.match(materialContrastStyles, /\.preview-window-stable-ui\[data-window-material="mica"\] \{[^}]*--cap-stable-hover: rgb\(31 31 31 \/ 10%\);[^}]*\}[\s\S]*?\.preview-window-stable-ui\.theme-dark\[data-window-material="mica"\] \{[^}]*--cap-stable-hover: rgb\(255 255 255 \/ 12%\);/u);
assert.match(fileInfoStyles, /\.preview-window-stable-ui\.theme-dark \{[^}]*--preview-stable-card: rgb\(24 24 24 \/ 52%\);/u);
assert.match(sidebarStyles, /preview-sidebar-actions\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/u);
assert.match(sidebarStyles, /preview-sidebar-actions button:hover \{ color: var\(--preview-action-hover-text\); background: var\(--cap-accent-gradient\); \}/u);
assert.match(sidebarStyles, /preview-sidebar-section-heading button \{[\s\S]*?color: var\(--preview-sidebar-muted\)/u);
assert.match(sidebarStyles, /preview-sidebar-section-heading button:not\(:disabled\):hover \{ color: var\(--theme-color\); \}/u);
assert.match(sidebarStyles, /preview-sidebar-keywords span \{ min-width: 40px; text-align: center; \}/u);
assert.match(sidebarStyles, /preview-sidebar-file-heading strong\s*\{[^}]*max-height: calc\(1\.45em \* 6\);[^}]*overflow-y: auto;[^}]*overflow-wrap: anywhere;[^}]*text-overflow: clip;[^}]*white-space: normal;/u);
assert.match(sidebarStyles, /preview-sidebar-path \{[^}]*max-height: calc\(1\.55em \* 6\);[^}]*overflow-y: auto;[^}]*scrollbar-width: thin;/u);
assert.match(sidebarStyles, /preview-sidebar-path:hover \{ color: var\(--theme-color\); \}/u);
assert.match(previewSource, /useSystemThemeMode\(\)[\s\S]*?effectiveTheme = themePreference === null[\s\S]*?previewData\?\.theme \?\? systemTheme[\s\S]*?themePreference === "system" \? systemTheme : themePreference/u);
assert.match(previewSource, /effectiveAppearanceColors = appearanceColors \?\? previewData\?\.appearanceColors[\s\S]*?--preview-action-hover-text": getTextColorForBackground\(effectiveAppearanceColors\.themeColor, effectiveAppearanceColors\.accentColor\)/u);
assert.match(previewSource, /useUiFontSize\(uiFontSize\)/u);
assert.match(previewSource, /preferences\.onChanged\(\(preferences\) => \{[\s\S]*?setThemePreference\(preferences\.themePreference\);[\s\S]*?setAppearanceColors\(preferences\.appearanceColors\);[\s\S]*?setUiFontSize\(preferences\.uiFontSize\);[\s\S]*?setWindowMaterial\(preferences\.windowMaterial\);/u);
assert.match(previewSource, /className=\{`app theme-\$\{effectiveTheme\}[\s\S]*?<StablePreviewTitlebar[\s\S]*?theme=\{effectiveTheme\}/u);
assert.match(previewSource, /data-window-material=\{windowMaterial\}/u);
assert.match(previewSource, /<StablePreviewTitlebar[\s\S]*?windowMaterial=\{windowMaterial\}/u);
assert.match(titlebarSource, /data-window-material=\{windowMaterial\}/u);
assert.match(materialContrastStyles, /\.preview-window-stable-ui\[data-window-material="mica"\][\s\S]*?--preview-stable-card: #ffffff[\s\S]*?theme-dark[\s\S]*?rgb\(38 38 38 \/ 97%\)/u);
assert.match(materialContrastStyles, /data-window-material="mica"\][^\n]*:is\([^)]*\.preview-sidebar-section[^)]*\.preview-embedded-metadata-details[^)]*\)[\s\S]*?box-shadow: inset 0 0 0 1px var\(--preview-stable-material-border\)/u);
assert.match(previewSource, /index\.updateManualKeywords\([\s\S]*?previewData\.filePath[\s\S]*?keywords\.join\(","\)[\s\S]*?manualKeywords: normalizedKeywords/u);
assert.match(manualMetadataRuntimeSource, /isSingleSenderAllowed: \(event, filePath\)[\s\S]*?event\.sender === previewWindow\.webContents[\s\S]*?activePreviewData\.filePath/u);
assert.match(manualMetadataRuntimeSource, /manualKeywords: keywords[\s\S]*?preview:manualKeywordsUpdated/u);
assert.doesNotMatch(sidebarSource, /className="is-danger"/u);
assert.match(sidebarStyles, /\.preview-sidebar-scroll::-webkit-scrollbar \{ width: 0; height: 0; \}/u);
assert.match(sidebarStyles, /\.preview-information-sidebar > \.cap-custom-scrollbar-vertical \{ position: absolute; top: 58px; right: 4px; bottom: 0;/u);
assert.match(titlebarStyles, /\.preview-window-stable-ui\s*\{[\s\S]*?border: 0;[\s\S]*?border-radius: 0;/u);
assert.match(titlebarStyles, /--preview-titlebar-height: 40px/u);
assert.match(shellStyles, /inset: var\(--preview-titlebar-height, 40px\) 0 0/u);
assert.match(shellStyles, /\.preview-stable-shell \.preview-window-content[\s\S]*?inset: 0 5px 5px 0/u);
assert.match(shellStyles, /\.preview-stable-shell \.preview-image-transform-canvas[\s\S]*?background: transparent/u);
assert.match(shellStyles, /\.preview-stable-shell \.preview-image-transform-canvas[\s\S]*?border-radius: 0/u);
assert.match(shellStyles, /\.preview-image-transform-canvas > \.preview-window-image[\s\S]*?border-radius: 0/u);
assert.match(previewSource, /className="preview-visual-with-metadata preview-video-canvas"/u);
assert.match(shellStyles, /\.preview-stable-shell \.preview-window-content\s*\{[\s\S]*?--preview-content-radius: 12px;[\s\S]*?border-radius: var\(--preview-content-radius\);/u);
assert.match(providerStyles, /\.preview-window-stable-ui \.preview-video-canvas \{[\s\S]*?width: 100%;[\s\S]*?height: 100%;[\s\S]*?border-radius: var\(--preview-content-radius, 12px\);[\s\S]*?box-shadow: none;/u);
assert.match(providerStyles, /\.preview-window-stable-ui \.preview-video \{[\s\S]*?width: 100%;[\s\S]*?height: 100%;[\s\S]*?border-radius: var\(--preview-content-radius, 12px\);[\s\S]*?object-fit: contain;/u);
assert.match(mainSource, /minimizable: true/u);
assert.match(mainSource, /\.\.\.getStablePreviewContentChrome\(sidebarWidth\)/u);
assert.match(previewSource, /previewSidebarWidth = previewSidebarLayout\.expanded \? previewSidebarExpandedWidth : 40/u);
assert.match(previewSource, /className="preview-window-shell preview-stable-shell"[\s\S]*?--preview-sidebar-width": `\$\{previewSidebarExpandedWidth\}px`/u);
assert.doesNotMatch(sidebarSource, /style=\{\{ "--preview-sidebar-width"/u);
assert.match(previewSource, /infoDimensions = previewData\.info\?\.kind === "folder"[\s\S]*?\{ width: 600, height: 580 \}[\s\S]*?hasExtendedInfoFallback \? 450 : 380/u);
assert.doesNotMatch(previewSource, /new ResizeObserver[\s\S]*?panel\.scrollHeight/u);
assert.match(previewSource, /preview-info-heading[\s\S]*?getFormatIconSvg\(previewData\.info\.extension\)[\s\S]*?previewInfoFormat[\s\S]*?previewData\.info\.name/u);
assert.match(previewSource, /preview-info-panel" data-preview-navigation-suppressed="true"/u);
assert.match(previewSource, /preview\.contentSize\(\{[\s\S]*?sidebarWidth: previewSidebarWidth/u);
assert.match(shellStyles, /\.preview-stable-shell \.preview-window-content\s*\{[\s\S]*?inset: 0 5px 5px 0;/u);
assert.match(shellStyles, /\.preview-window-stable-ui\s*\{[\s\S]*?font-family:\s*var\(--cap-ui-font-family\)[\s\S]*?font-size:\s*var\(--cap-ui-font-body\)/u);
assert.match(sidebarStyles, /preview-sidebar-file-heading strong[\s\S]*?font-size:\s*var\(--cap-ui-font-heading\)/u);
assert.match(shellStyles, /--preview-stable-surface: rgb\(255 255 255 \/ 50%\)[\s\S]*?theme-dark[\s\S]*?rgb\(26 26 26 \/ 58%\)[\s\S]*?background: var\(--preview-stable-surface\)/u);
assert.match(shellStyles, /@import "\.\/StablePreviewFileInfo\.css"/u);
assert.match(shellStyles, /@import "\.\/StablePreviewProviders\.css"/u);
assert.match(fileInfoStyles, /\.preview-window-stable-ui \.preview-info-heading[\s\S]*?\.preview-info-format-icon[\s\S]*?\.preview-info-panel dl[\s\S]*?background: var\(--preview-stable-card\)/u);
assert.match(fileInfoStyles, /\.preview-window-stable-ui \.preview-info-panel \{[^}]*height: auto; max-height: 100%;/u);
assert.match(previewSource, /preview-audio-identity[\s\S]*?getFormatIconSvg\(previewData\.info\?\.extension \?\? ""\)[\s\S]*?preview-audio-format-icon/u);
for (const providerClass of ["preview-text-panel", "preview-pdf-panel", "preview-archive-panel", "preview-font-panel", "preview-epub-panel", "preview-mobi-panel", "preview-audio-panel", "preview-video"]) {
  assert.match(providerStyles, new RegExp(`\\.preview-window-stable-ui \\.${providerClass}`, "u"));
}
assert.match(mainSource, /skipTaskbar: false/u);
assert.match(mainSource, /previewWindow\.setSkipTaskbar\(false\)/u);
assert.match(accessibilityStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.preview-window-stable-ui \*/u);
assert.doesNotMatch(accessibilityStyles, /preview-sidebar-resize-handle/u);

console.log(JSON.stringify({
  formalStablePreviewEntryPresent: true,
  stablePreviewTitlebarAndNativeMinimizePresent: true,
  stablePreviewNativeTaskbarMinimizePresent: true,
  stablePreviewSingleWindowSurfacePresent: true,
  legacyPreviewDisplayRemoved: true,
  singleProviderLifecyclePreserved: true,
  formalInformationSidebarPresent: true,
  cardBasedInformationLayoutVerified: true,
  embeddedMetadataMovedWithoutStableDuplication: true,
  sidebarExpandedStatePersistenceVerified: true,
  sidebarScrollNavigationSuppressed: true,
  existingFileActionsReused: true,
  fixedTwoStateSidebarWidthVerified: true,
  reducedMotionVerified: true
}));
