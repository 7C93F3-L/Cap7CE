const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const {
  getWindowLayoutFileName,
  isStableWindowPresentationMode
} = require("../dist-electron/windowPresentationPolicy.js");

void (async () => {
  assert.equal(isStableWindowPresentationMode("stable"), true);
  assert.equal(isStableWindowPresentationMode("cap7ce"), false);
  assert.equal(isStableWindowPresentationMode("compatibility"), false);
  assert.equal(getWindowLayoutFileName("stable"), "window-layout-stable-ui.json");

  const rendererEntry = read("src/renderer/main.tsx");
  const globalStyles = read("src/renderer/styles.css");
  const typographyStyles = read("src/renderer/typography.css");
  const typographySource = read("src/renderer/typography.ts");
  const mainSource = read("electron/main.ts");
  const appSource = read("src/renderer/App.tsx");
  const rootSource = read("src/renderer/stable-ui/StableUiRoot.tsx");
  const titlebarSource = read("src/renderer/stable-ui/StableTitlebar.tsx");
  const titlebarPortalSource = read("src/renderer/window-presentation/WindowTitlebarPortal.tsx");
  const pinButtonSource = read("src/renderer/window-presentation/WindowPinButton.tsx");
  const foundationStyles = read("src/renderer/stable-ui/StableUiFoundation.css");
  const materialContrastStyles = read("src/renderer/stable-ui/StableMaterialContrast.css");
  const accessibilityStyles = read("src/renderer/stable-ui/StableUiAccessibility.css");
  const stableUiStyles = `${foundationStyles}\n${accessibilityStyles}`;
  const packageJson = JSON.parse(read("package.json"));

  if (!rendererEntry.includes('Promise.all([import("./App"), import("./stable-ui/StableUiRoot")])')
    || !rendererEntry.includes('<App stableUiRenderer={StableUiRoot} />')
    || /rendererSearchParams\.get\("presentation"\)/.test(rendererEntry)) {
    throw new Error("The product main Renderer must assemble only the stable UI root.");
  }
  if (!mainSource.includes('mainUrl.searchParams.set("presentation", windowPresentationRuntime.mode)')
    || !mainSource.includes('query: { presentation: windowPresentationRuntime.mode }')) {
    throw new Error("Development and packaged main windows must receive the same presentation mode query.");
  }
  if (!mainSource.includes('windowPresentationRuntime.layoutFileName')) {
    throw new Error("Stable UI must use the formal presentation policy layout namespace.");
  }
  if (/resolveResizeTargetState|scheduleResizeSettledCheck|forceApplyDefaultMicroBounds/.test(mainSource)) {
    throw new Error("Stable UI must not retain legacy resize-state settling or size presets.");
  }
  if (rootSource.includes("setShellState(") || rootSource.includes("size-contract")) {
    throw new Error("Stable UI development root must not select a legacy shell shape or size contract.");
  }
  assert.match(appSource, /if \(stableUi\) void window\.cap7ce\?\.window\.setShellState\("standby"\); else setShellState\("standby"\);/);
  assert.match(appSource, /if \(mode === "standby"\) setCommandShellMode\("line"\);[\s\S]*?window\.setTimeout/);
  if (!titlebarSource.includes("<WindowPinButton") || !pinButtonSource.includes("aria-pressed={pinned}")) {
    throw new Error("Stable main and preview foundations must share the existing accessible pin control.");
  }
  if (!titlebarSource.includes("<WindowTitlebarPortal>")
    || !/createPortal\(children, document\.body\)/.test(titlebarPortalSource)) {
    throw new Error("Stable titlebar must remain portaled outside the virtual grid so scrolling cannot invalidate native drag hit testing.");
  }
  for (const marker of [
    "--cap-stable-edge-gap: 5px",
    "--cap-stable-radius-md: 12px",
    "--cap-stable-font-size: var(--cap-ui-font-body)",
    "env(titlebar-area-width",
    "z-index: 60",
    "width: 46px",
    "::-webkit-scrollbar { width: 8px; height: 8px; }",
    "@media (prefers-reduced-motion: reduce)"
  ]) {
    if (!stableUiStyles.includes(marker)) {
      throw new Error(`Stable UI visual foundation is missing ${marker}.`);
    }
  }
  assert.match(foundationStyles, /\.cap-stable-ui\.theme-dark[\s\S]*?color-scheme:\s*dark/u);
  assert.match(rendererEntry, /import "\.\/styles\.css";/u);
  assert.match(globalStyles, /^@import "\.\/typography\.css";/u);
  assert.match(typographyStyles, /--cap-ui-font-base:\s*13px[\s\S]*?--cap-ui-font-page-title:[\s\S]*?--cap-ui-font-heading:[\s\S]*?--cap-ui-font-caption:/u);
  assert.doesNotMatch(typographyStyles, /--cap-ui-font-(?:feature-title|display|prominent|micro):/u);
  assert.match(typographySource, /uiFontSizeOptions: UiFontSize\[\] = \[12, 13, 14, 15, 16\]/u);
  assert.match(typographySource, /document\.documentElement\.style\.setProperty\("--cap-ui-font-base", `\$\{size\}px`\)/u);
  assert.match(appSource, /useUiFontSize\(stableUi \? uiFontSize : defaultUiFontSize\)/u);
  assert.match(appSource, /setWindowMaterial\(preferences\.windowMaterial\)[\s\S]*?windowMaterial=\{windowMaterial\}/u);
  assert.match(rootSource, /data-window-material=\{windowMaterial\}[\s\S]*?<StableTitlebar[\s\S]*?windowMaterial=\{windowMaterial\}/u);
  assert.match(titlebarSource, /data-window-material=\{windowMaterial\}/u);
  assert.match(materialContrastStyles, /\.cap-stable-ui\[data-window-material="mica"\][\s\S]*?--cap-stable-surface: rgb\(246 246 246 \/ 96%\)[\s\S]*?theme-dark[\s\S]*?rgb\(24 24 24 \/ 96%\)/u);
  assert.match(materialContrastStyles, /--cap-stable-surface-soft: #ffffff[\s\S]*?--cap-stable-search-surface: #ffffff/u);
  assert.match(materialContrastStyles, /\.cap-stable-ui\.theme-dark\[data-window-material="mica"\][\s\S]*?--cap-stable-search-surface: var\(--cap-stable-navigation-state\)/u);
  assert.match(materialContrastStyles, /--cap-stable-flyout-surface: color-mix\(in srgb, var\(--panel-bg\) 80%, transparent\)[\s\S]*?cap-stable-sidebar-flyout button\.is-selected[\s\S]*?box-shadow: inset 0 0 0 1px var\(--cap-stable-material-border\)/u);
  assert.match(materialContrastStyles, /:not\(\.theme-dark\)\[data-window-material="mica"\] \.cap-stable-skim-slot\s*\{\s*--cap-stable-skim-hover-surface: rgb\(31 31 31 \/ 5%\);\s*--cap-stable-selected-surface: rgb\(31 31 31 \/ 8%\);[\s\S]*?theme-dark[\s\S]*?rgb\(0 0 0 \/ 46%\)/u);
  assert.match(foundationStyles, /font-family:\s*var\(--cap-ui-font-family\)[\s\S]*?font-size:\s*var\(--cap-stable-font-size\)/u);
  assert.doesNotMatch(foundationStyles, /@media\s*\(prefers-color-scheme:\s*dark\)/u);
  assert.match(foundationStyles, /--cap-stable-selected:\s*color-mix\(in srgb, var\(--theme-color/u);
  assert.match(foundationStyles, /--cap-stable-grid-surface:\s*var\(--cap-stable-surface-soft\)/u);
  assert.match(materialContrastStyles, /data-window-material="acrylic"[\s\S]*?--cap-stable-grid-surface: rgb\(255 255 255 \/ 46%\)[\s\S]*?--cap-stable-skim-hover-surface: rgb\(255 255 255 \/ 62%\)[\s\S]*?--cap-stable-selected-surface: rgb\(255 255 255 \/ 78%\)/u);
  assert.match(foundationStyles, /--cap-stable-focus:\s*var\(--accent-color/u);
  assert.match(foundationStyles, /scrollbar-color:\s*var\(--scrollbar-thumb\) transparent/u);
  assert.match(foundationStyles, /::-webkit-scrollbar-thumb:hover,[\s\S]*?background:\s*var\(--scrollbar-thumb-hover\)/u);
  assert.doesNotMatch(foundationStyles, /--cap-stable-scrollbar/u);
  assert.match(accessibilityStyles, /\.cap-stable-titlebar \*[\s\S]*?transition-duration:\s*0ms !important/u);
  assert.match(packageJson.scripts.dev, /npm:dev:renderer[\s\S]*?npm:dev:electron/u);
  assert.equal(packageJson.scripts["dev:stable-ui"], undefined);
  assert.equal(packageJson.scripts["dev:cap7ce"], undefined);
  assert.equal(packageJson.scripts["dev:compatibility"], undefined);
  assert.equal(packageJson.scripts["dev:stable-ui:outer"], undefined);
  assert.doesNotMatch(packageJson.scripts.dev, /CAP7CE_WINDOW_PRESENTATION_MODE|SIZE_CONTRACT/u);

  console.log(JSON.stringify({
    stableOnlyRendererEntryVerified: true,
    stableDefaultLayoutIsolated: true,
    sharedPinControlVerified: true,
    scrollIsolatedTitlebarPortalVerified: true,
    stableOnlyDevelopmentCommandVerified: true,
    legacyResizeStateSettlingBypassed: true,
    nativeCloseUsesSafeStandbyChain: true,
    legacySizePresetNotAppliedAtStartup: true,
    stableTokensAndScrollbarVerified: true,
    resolvedThemeAndCustomColorsVerified: true,
    portaledTitlebarReducedMotionVerified: true
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
