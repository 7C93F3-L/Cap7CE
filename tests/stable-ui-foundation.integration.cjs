const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const {
  applyStableUiAlwaysOnTopPreference,
  applyStableUiDevelopmentQuery,
  resolveStableUiDevelopmentOptions,
  resolveStableUiLayoutFileName
} = require("../dist-electron/stableUiDevelopmentContract.js");

void (async () => {
  const disabledWithoutDevServer = resolveStableUiDevelopmentOptions({
    devServerUrl: undefined,
    rendererFlag: "1",
    windowPresentationMode: "compatibility"
  });
  assert.equal(disabledWithoutDevServer.enabled, false);

  const disabledOutsideCompatibility = resolveStableUiDevelopmentOptions({
    devServerUrl: "http://127.0.0.1:5173",
    rendererFlag: "1",
    windowPresentationMode: "cap7ce"
  });
  assert.equal(disabledOutsideCompatibility.enabled, false);

  const stableDevelopment = resolveStableUiDevelopmentOptions({
    devServerUrl: "http://127.0.0.1:5173",
    rendererFlag: "1",
    windowPresentationMode: "compatibility"
  });
  assert.equal(stableDevelopment.enabled, true);
  assert.equal(resolveStableUiLayoutFileName("window-layout-compatibility.json", stableDevelopment), "window-layout-stable-ui-development.json");
  assert.equal(resolveStableUiLayoutFileName("window-layout.json", disabledWithoutDevServer), "window-layout.json");

  let persistAlwaysOnTopCalls = 0;
  const developmentAlwaysOnTop = await applyStableUiAlwaysOnTopPreference(true, stableDevelopment, async () => {
    persistAlwaysOnTopCalls += 1;
    return { alwaysOnTop: false };
  });
  assert.equal(developmentAlwaysOnTop, true);
  assert.equal(persistAlwaysOnTopCalls, 0);
  const regularAlwaysOnTop = await applyStableUiAlwaysOnTopPreference(true, disabledWithoutDevServer, async (enabled) => {
    persistAlwaysOnTopCalls += 1;
    return { alwaysOnTop: enabled };
  });
  assert.equal(regularAlwaysOnTop, true);
  assert.equal(persistAlwaysOnTopCalls, 1);

  const developmentUrl = applyStableUiDevelopmentQuery(new URL("http://127.0.0.1:5173"), stableDevelopment);
  assert.equal(developmentUrl.searchParams.get("ui"), "stable");
  assert.equal(developmentUrl.searchParams.has("size-contract"), false);
  const disabledUrl = applyStableUiDevelopmentQuery(new URL("http://127.0.0.1:5173"), disabledWithoutDevServer);
  assert.equal(disabledUrl.searchParams.has("ui"), false);

  const rendererEntry = read("src/renderer/main.tsx");
  const mainSource = read("electron/main.ts");
  const appSource = read("src/renderer/App.tsx");
  const contractSource = read("electron/stableUiDevelopmentContract.ts");
  const rootSource = read("src/renderer/stable-ui/StableUiRoot.tsx");
  const titlebarSource = read("src/renderer/stable-ui/StableTitlebar.tsx");
  const pinButtonSource = read("src/renderer/window-presentation/WindowPinButton.tsx");
  const foundationStyles = read("src/renderer/stable-ui/StableUiFoundation.css");
  const packageJson = JSON.parse(read("package.json"));

  if (!/import\.meta\.env\.DEV\s*&&\s*rendererSearchParams\.get\("ui"\)\s*===\s*"stable"/.test(rendererEntry)
    || !rendererEntry.includes('import("./stable-ui/StableUiRoot")')) {
    throw new Error("Stable UI Renderer root must remain behind the Vite development gate.");
  }
  if (!mainSource.includes("applyCurrentStableUiDevelopmentQuery(new URL(devServerUrl)")
    || !mainSource.includes("mainWindow.loadFile(path.join(__dirname, \"../dist/index.html\"))")) {
    throw new Error("Stable UI selection must remain limited to the development server URL path.");
  }
  if (!mainSource.includes("getStableUiDevelopmentLayoutFileName(windowPresentationRuntime.layoutFileName")
    || !mainSource.includes("applyCurrentStableUiAlwaysOnTopPreference(requestedEnabled")) {
    throw new Error("Stable UI development must isolate layout writes and always-on-top preferences from the formal compatibility host.");
  }
  if (!contractSource.includes("isCurrentStableUiDevelopmentEnabled")
    || !mainSource.includes("if (isCurrentStableUiDevelopmentEnabled(windowPresentationRuntime.mode) || !mainWindow")
    || !mainSource.includes("if (isCurrentStableUiDevelopmentEnabled(windowPresentationRuntime.mode)) mainWindow?.show();")) {
    throw new Error("Stable UI development must bypass legacy resize-state settling and open without applying a legacy size preset.");
  }
  if (rootSource.includes("setShellState(") || rootSource.includes("size-contract")) {
    throw new Error("Stable UI development root must not select a legacy shell shape or size contract.");
  }
  assert.match(appSource, /if \(stableUi\) void window\.cap7ce\?\.window\.setShellState\("standby"\); else setShellState\("standby"\);/);
  assert.match(appSource, /if \(mode === "standby"\) setCommandShellMode\("line"\); else window\.setTimeout/);
  if (!titlebarSource.includes("<WindowPinButton") || !pinButtonSource.includes("aria-pressed={pinned}")) {
    throw new Error("Stable main and preview foundations must share the existing accessible pin control.");
  }
  for (const marker of [
    "--cap-stable-edge-gap: 5px",
    "--cap-stable-radius-md: 14px",
    "--cap-stable-font-size: 13px",
    "env(titlebar-area-width",
    "width: 46px",
    "::-webkit-scrollbar { width: 8px; height: 8px; }",
    "@media (prefers-reduced-motion: reduce)"
  ]) {
    if (!foundationStyles.includes(marker)) {
      throw new Error(`Stable UI visual foundation is missing ${marker}.`);
    }
  }
  assert.match(packageJson.scripts["dev:stable-ui"], /CAP7CE_STABLE_UI=1/);
  assert.equal(packageJson.scripts["dev:stable-ui:outer"], undefined);
  assert.doesNotMatch(packageJson.scripts["dev:stable-ui"], /SIZE_CONTRACT/);

  console.log(JSON.stringify({
    developmentOnlyRendererGateVerified: true,
    compatibilityHostRequired: true,
    sharedPinControlVerified: true,
    developmentPreferencesAndLayoutIsolated: true,
    legacyResizeStateSettlingBypassed: true,
    nativeCloseUsesSafeStandbyChain: true,
    legacySizePresetNotAppliedAtStartup: true,
    stableTokensAndScrollbarVerified: true
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
