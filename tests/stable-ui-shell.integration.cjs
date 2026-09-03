const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const shellFiles = [
  "src/renderer/stable-ui/StableMainShell.tsx",
  "src/renderer/stable-ui/StableShellSidebar.tsx",
  "src/renderer/stable-ui/StableSkimSlot.tsx",
  "src/renderer/stable-ui/StableSkimToolbar.tsx",
  "src/renderer/stable-ui/useStableShellLayout.ts",
  "src/renderer/stable-ui/useStableShellResize.ts"
];

const rootSource = read("src/renderer/stable-ui/StableUiRoot.tsx");
const titlebarSource = read("src/renderer/stable-ui/StableTitlebar.tsx");
const mainShellSource = read(shellFiles[0]);
const sidebarSource = read(shellFiles[1]);
const layoutSource = read(shellFiles[4]);
const resizeSource = read(shellFiles[5]);
const shellStyles = read("src/renderer/stable-ui/StableMainShell.css");
const sidebarStyles = read("src/renderer/stable-ui/StableSidebar.css");
const foundationStyles = read("src/renderer/stable-ui/StableUiFoundation.css");
const resultStyles = read("src/renderer/stable-ui/StableSearchResults.css");
const skimStyles = read("src/renderer/stable-ui/StableSkimPanel.css");
const scrollbarStyles = read("src/renderer/CustomScrollbar.css");
const globalStyles = read("src/renderer/styles.css");
const combinedShellSource = shellFiles.map(read).join("\n");

assert.match(rootSource, /<StableMainShell resultContent=\{resultContent\} sidebar=\{sidebar\} skim=\{skim\}\s*\/>/);
assert.match(titlebarSource, /\{searchInput\}/);
assert.match(titlebarSource, /\{resultStatus\}/);
assert.match(sidebarSource, /aria-pressed=\{skimOpen\}/);
assert.match(mainShellSource, /role="separator"[\s\S]*?aria-valuenow=\{sidebarWidth\}[\s\S]*?onKeyDown=\{resizeSidebarByKeyboard\}/u);
assert.match(mainShellSource, /aria-label=\{t\("stableUi\.resultsRegion"\)\}/u);
assert.match(resizeSource, /event\.key === "ArrowLeft"[\s\S]*?event\.key === "ArrowRight"/u);

for (const marker of [
  "useState(160)",
  "useState(360)",
  "clamp(event.clientX, 40, 320)",
  "clamp(window.innerWidth - event.clientX, 280, 480)",
  "resetSidebarWidth: () => setSidebarWidth(160)",
  "resetSkimWidth: () => setSkimWidth(360)"
]) {
  assert.ok(`${layoutSource}\n${resizeSource}`.includes(marker), `Stable UI shell layout is missing ${marker}.`);
}

for (const marker of [
  "--cap-stable-sidebar-width: 160px",
  "--cap-stable-skim-width: 360px",
  "@media (max-width: 920px) and (min-height: 360px)",
  "@media (max-width: 560px)",
  "@media (max-height: 359.98px)",
  "grid-auto-flow: column",
  ".cap-stable-main-shell, .cap-stable-main-shell.is-skim-open { grid-template-columns: minmax(0, 1fr); }",
  ".cap-stable-main-shell .cap-stable-directory-list-frame { grid-template-columns: minmax(0, 1fr); }",
  ".cap-stable-main-shell .cap-stable-directory-list-frame > .cap-custom-scrollbar-vertical { position: absolute; top: 0; right: 0; bottom: 0;",
  ".cap-stable-main-shell .cap-custom-scrollbar-horizontal { right: 0; bottom: 0; }",
  ".cap-stable-main-shell.is-skim-open .cap-stable-results-slot { display: none; }"
]) {
  assert.ok(shellStyles.includes(marker), `Stable UI responsive shell is missing ${marker}.`);
}
assert.ok(sidebarStyles.includes("@container (max-width: 95px)"), "Stable UI sidebar is missing its compact container layout.");
assert.match(foundationStyles, /\.cap-stable-titlebar-pin-icon \{ width: 24px; height: 24px; \}/u);
assert.match(scrollbarStyles, /\.cap-custom-scrollbar-thumb\s*\{[\s\S]*?background: var\(--scrollbar-thumb\);/u);
assert.match(scrollbarStyles, /\.cap-custom-scrollbar-thumb:hover\s*\{[\s\S]*?background: var\(--scrollbar-thumb-hover\);/u);
assert.match(resultStyles, /\.cap-stable-results-slot > \.cap-results-view\s*\{[\s\S]*?padding: 10px 2px 10px 10px;/u);
assert.match(skimStyles, /\.cap-stable-skim-content > \.cap-skim-view\.is-embedded\s*\{[\s\S]*?padding: 10px 2px 10px 10px;/u);
assert.doesNotMatch(shellStyles, /\.cap-stable-main-shell \.cap-scroll-viewport-frame \{ grid-template-columns:/u);
assert.doesNotMatch(scrollbarStyles, /\.cap-custom-scrollbar-thumb\s*\{[^}]*box-shadow:/u);
assert.equal((globalStyles.match(/--scroll-thumb: color-mix\(in srgb, var\(--text-main\) 42%, transparent\);/gu) || []).length, 2);
assert.equal((globalStyles.match(/--scrollbar-thumb-hover: color-mix\(in srgb, var\(--text-main\) 62%, transparent\);/gu) || []).length, 2);

assert.doesNotMatch(combinedShellSource, /window\.cap7ce|setShellState|shellState|\bmicro\b|\bmini\b|\bnormal\b/);
assert.doesNotMatch(combinedShellSource, /stable-ui-canvas|prototypes[\\/]|C:\\Users\\|示例目录|Example/);
assert.match(combinedShellSource, /aria-hidden="true"/);

console.log(JSON.stringify({
  responsiveShellCompositionVerified: true,
  resizeRangesVerified: true,
  narrowAndLowWindowLayoutsVerified: true,
  noBusinessDataOrLegacyShapeState: true,
  keyboardResizeAndLocalizedRegionsVerified: true,
  stablePinIconMatchesCaptionScale: true
}));
