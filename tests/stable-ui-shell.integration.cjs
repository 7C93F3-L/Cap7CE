const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const shellFiles = [
  "src/renderer/stable-ui/StableMainShell.tsx",
  "src/renderer/stable-ui/StablePlaceholderGrid.tsx",
  "src/renderer/stable-ui/StableShellSidebar.tsx",
  "src/renderer/stable-ui/StableSkimSlot.tsx"
];

const rootSource = read("src/renderer/stable-ui/StableUiRoot.tsx");
const titlebarSource = read("src/renderer/stable-ui/StableTitlebar.tsx");
const mainShellSource = read(shellFiles[0]);
const sidebarSource = read(shellFiles[2]);
const shellStyles = read("src/renderer/stable-ui/StableMainShell.css");
const combinedShellSource = shellFiles.map(read).join("\n");

assert.match(rootSource, /<StableMainShell resultContent=\{resultContent\}\s*\/>/);
assert.match(titlebarSource, /\{searchInput\}/);
assert.match(titlebarSource, /\{resultStatus\}/);
assert.match(sidebarSource, /aria-pressed=\{skimOpen\}/);

for (const marker of [
  "useState(160)",
  "useState(360)",
  "clamp(event.clientX, 40, 320)",
  "clamp(window.innerWidth - event.clientX, 280, 480)",
  "onDoubleClick={() => setSidebarWidth(160)}",
  "onDoubleClick={() => setSkimWidth(360)}"
]) {
  assert.ok(mainShellSource.includes(marker), `Stable UI shell is missing ${marker}.`);
}

for (const marker of [
  "--cap-stable-sidebar-width: 160px",
  "--cap-stable-skim-width: 360px",
  "@container (max-width: 95px)",
  "@media (max-width: 920px) and (min-height: 360px)",
  "@media (max-width: 560px)",
  "@media (max-height: 359.98px)",
  "grid-auto-flow: column",
  ".cap-stable-main-shell.is-skim-open .cap-stable-results-slot { display: none; }"
]) {
  assert.ok(shellStyles.includes(marker), `Stable UI responsive shell is missing ${marker}.`);
}

assert.doesNotMatch(combinedShellSource, /window\.cap7ce|setShellState|shellState|\bmicro\b|\bmini\b|\bnormal\b/);
assert.doesNotMatch(combinedShellSource, /stable-ui-canvas|prototypes[\\/]|C:\\Users\\|示例目录|Example/);
assert.match(combinedShellSource, /aria-hidden="true"/);

console.log(JSON.stringify({
  responsiveShellCompositionVerified: true,
  resizeRangesVerified: true,
  narrowAndLowWindowLayoutsVerified: true,
  noBusinessDataOrLegacyShapeState: true
}));
