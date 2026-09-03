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
  const mainSource = read("electron/main.ts");
  const appSource = read("src/renderer/App.tsx");
  const rootSource = read("src/renderer/stable-ui/StableUiRoot.tsx");
  const titlebarSource = read("src/renderer/stable-ui/StableTitlebar.tsx");
  const titlebarPortalSource = read("src/renderer/window-presentation/WindowTitlebarPortal.tsx");
  const pinButtonSource = read("src/renderer/window-presentation/WindowPinButton.tsx");
  const foundationStyles = read("src/renderer/stable-ui/StableUiFoundation.css");
  const accessibilityStyles = read("src/renderer/stable-ui/StableUiAccessibility.css");
  const stableUiStyles = `${foundationStyles}\n${accessibilityStyles}`;
  const packageJson = JSON.parse(read("package.json"));

  if (!/rendererSearchParams\.get\("presentation"\)\s*===\s*"stable"/.test(rendererEntry)
    || !rendererEntry.includes('import("./stable-ui/StableUiRoot")')) {
    throw new Error("Stable UI Renderer root must be reachable from the formal stable presentation mode.");
  }
  if (!mainSource.includes('mainUrl.searchParams.set("presentation", windowPresentationRuntime.mode)')
    || !mainSource.includes('query: { presentation: windowPresentationRuntime.mode }')) {
    throw new Error("Development and packaged main windows must receive the same presentation mode query.");
  }
  if (!mainSource.includes('windowPresentationRuntime.layoutFileName')) {
    throw new Error("Stable UI must use the formal presentation policy layout namespace.");
  }
  if (!mainSource.includes("if (isStableWindowPresentationMode(windowPresentationRuntime.mode) || !mainWindow")
    || !mainSource.includes("if (isStableWindowPresentationMode(windowPresentationRuntime.mode)) mainWindow?.show();")) {
    throw new Error("Stable UI must bypass legacy resize-state settling and open without applying a legacy size preset.");
  }
  if (rootSource.includes("setShellState(") || rootSource.includes("size-contract")) {
    throw new Error("Stable UI development root must not select a legacy shell shape or size contract.");
  }
  assert.match(appSource, /if \(stableUi\) void window\.cap7ce\?\.window\.setShellState\("standby"\); else setShellState\("standby"\);/);
  assert.match(appSource, /if \(mode === "standby"\) setCommandShellMode\("line"\); else window\.setTimeout/);
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
    "--cap-stable-font-size: 13px",
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
  assert.doesNotMatch(foundationStyles, /@media\s*\(prefers-color-scheme:\s*dark\)/u);
  assert.match(foundationStyles, /--cap-stable-selected:\s*color-mix\(in srgb, var\(--theme-color/u);
  assert.match(foundationStyles, /--cap-stable-focus:\s*var\(--accent-color/u);
  assert.match(foundationStyles, /scrollbar-color:\s*var\(--scrollbar-thumb\) transparent/u);
  assert.match(foundationStyles, /::-webkit-scrollbar-thumb:hover,[\s\S]*?background:\s*var\(--scrollbar-thumb-hover\)/u);
  assert.doesNotMatch(foundationStyles, /--cap-stable-scrollbar/u);
  assert.match(accessibilityStyles, /\.cap-stable-titlebar \*[\s\S]*?transition-duration:\s*0ms !important/u);
  assert.match(packageJson.scripts["dev:stable-ui"], /CAP7CE_WINDOW_PRESENTATION_MODE=stable/);
  assert.match(packageJson.scripts["dev:cap7ce"], /CAP7CE_WINDOW_PRESENTATION_MODE=cap7ce/);
  assert.match(packageJson.scripts["dev:compatibility"], /CAP7CE_WINDOW_PRESENTATION_MODE=compatibility/);
  assert.equal(packageJson.scripts["dev:stable-ui:outer"], undefined);
  assert.doesNotMatch(packageJson.scripts["dev:stable-ui"], /SIZE_CONTRACT/);

  console.log(JSON.stringify({
    formalStableRendererEntryVerified: true,
    stableDefaultLayoutIsolated: true,
    sharedPinControlVerified: true,
    scrollIsolatedTitlebarPortalVerified: true,
    legacyHostDevelopmentCommandsPreserved: true,
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
