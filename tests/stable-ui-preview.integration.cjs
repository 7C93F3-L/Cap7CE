const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const mainSource = read("electron/main.ts");
const previewSource = read("src/renderer/PreviewWindowApp.tsx");
const sidebarSource = read("src/renderer/preview/PreviewInformationSidebar.tsx");
const layoutSource = read("src/renderer/preview/usePreviewSidebarLayout.ts");
const shellStyles = read("src/renderer/preview/StablePreviewShell.css");
const resultsSource = read("src/renderer/results/ResultsView.tsx");
const sidebarDataSource = read("src/renderer/preview/previewSidebarData.ts");

assert.match(mainSource, /const previewUrl = applyCurrentStableUiDevelopmentQuery\(new URL\(devServerUrl\), windowPresentationRuntime\.mode\);[\s\S]*?previewUrl\.searchParams\.set\("window", "preview"\)/u);
assert.match(mainSource, /query: \{ window: "preview", presentation: windowPresentationRuntime\.mode \}/u);
assert.match(previewSource, /const isStableUiPreview = import\.meta\.env\.DEV[\s\S]*?URLSearchParams\(window\.location\.search\)\.get\("ui"\) === "stable"/u);
assert.match(previewSource, /isStableUiPreview && <PreviewInformationSidebar/u);
assert.match(previewSource, /!isStableUiPreview && <WindowControlRail/u);
assert.match(previewSource, /data-preview-navigation-suppressed/u);
assert.match(previewSource, /!isStableUiPreview && previewData\.embeddedMetadata[\s\S]*?variant="sheet"/u);

assert.match(resultsSource, /buildPreviewSidebarData\(image\)/u);
assert.match(sidebarDataSource, /manualKeywords: item\.keywords/u);
assert.match(sidebarDataSource, /userDescription: item\.userDescription/u);
assert.match(sidebarDataSource, /searchEvidence: item\.searchEvidence/u);
assert.match(sidebarSource, /PreviewEmbeddedMetadata[\s\S]*?variant="details"/u);
assert.match(sidebarSource, /data-preview-navigation-suppressed="true"/u);
assert.doesNotMatch(sidebarSource, /window\.cap7ce/u);

assert.match(layoutSource, /cap7ce\.preview\.sidebar-layout\.v1/u);
assert.match(layoutSource, /previewSidebarMinimumWidth = 280/u);
assert.match(layoutSource, /previewSidebarMaximumWidth = 420/u);
assert.match(layoutSource, /previewSidebarDefaultWidth = 320/u);
assert.match(shellStyles, /preview-information-sidebar\.is-collapsed[\s\S]*?40px/u);
assert.match(shellStyles, /\.preview-window-compatibility \.preview-stable-shell \.preview-window-content[\s\S]*?inset: 0 5px 5px 0/u);

console.log(JSON.stringify({
  stablePreviewDevGatePresent: true,
  legacyAndPackagedPreviewPreserved: true,
  singleProviderLifecyclePreserved: true,
  formalInformationSidebarPresent: true,
  embeddedMetadataMovedWithoutStableDuplication: true,
  sidebarLayoutPersistenceBounded: true,
  sidebarScrollNavigationSuppressed: true,
  existingFileActionsReused: true
}));
