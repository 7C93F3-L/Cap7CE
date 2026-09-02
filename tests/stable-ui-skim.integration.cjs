const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const appSource = read("src/renderer/App.tsx");
const shellSource = read("src/renderer/stable-ui/StableMainShell.tsx");
const slotSource = read("src/renderer/stable-ui/StableSkimSlot.tsx");
const toolbarSource = read("src/renderer/stable-ui/StableSkimToolbar.tsx");
const contractSource = read("src/renderer/stable-ui/stableSkimTypes.ts");
const panelStyles = read("src/renderer/stable-ui/StableSkimPanel.css");
const skimViewSource = read("src/renderer/skim/SkimView.tsx");
const layoutSource = read("src/renderer/stable-ui/useStableShellLayout.ts");

assert.equal((appSource.match(/useSkimReadController\(/g) ?? []).length, 1, "Stable UI must reuse the single formal Skim read controller.");
assert.match(appSource, /renderContent: \(active\) => <SkimView \{\.\.\.createSkimViewProps\(true, active\)\} \/>/);
assert.match(appSource, /onBack: \(\) => navigateSkimParent\(false\)/);
assert.match(appSource, /sortField: skimSortPreference\.sortField, sortDirection: skimSortPreference\.sortDirection/);
assert.match(appSource, /onDisplayModeChange: \(mode\) => updateSkimDisplay\(\{ \.\.\.skimDisplay, mode \}\)/);
assert.match(shellSource, /<StableSkimSlot \{\.\.\.skim\} content=\{skim\.renderContent\(skimOpen\)\} \/>/);
assert.match(layoutSource, /useState\(false\)/);
assert.doesNotMatch(layoutSource, /useEffect|openedSkimRef/);
assert.match(layoutSource, /if \(!open\) onSkimOpen\(\)/);
assert.doesNotMatch(slotSource, /StablePlaceholderGrid|aria-label="Skim 布局占位区"/);

for (const marker of ["currentPath", "breadcrumbs", "onOpenPath", "onSortChange", "onDisplayModeChange", "renderContent: (active: boolean)"]) {
  assert.ok(contractSource.includes(marker), `Stable Skim contract is missing ${marker}.`);
}
for (const marker of ["onDoubleClick={() => setEditingPath(true)}", "onOpenRoot", "breadcrumb.path", "sortField", "displayMode"]) {
  assert.ok(toolbarSource.includes(marker), `Stable Skim toolbar is missing ${marker}.`);
}
for (const marker of ["embedded?: boolean", "responsiveLayout?: boolean", "active?: boolean", "if (!active) return undefined", "!embedded && <Cap7CESearchCapsule", "window.matchMedia(\"(max-height: 359.98px)\")"]) {
  assert.ok(skimViewSource.includes(marker), `Formal Skim view bridge is missing ${marker}.`);
}
for (const marker of ["window.cap7ce?.files.startDrag", "buildFileContextMenuGroups", "resolveFileContentPreview", "CustomScrollbar"]) {
  assert.ok(skimViewSource.includes(marker), `Formal Skim file capability is missing ${marker}.`);
}
for (const marker of ["grid-template-rows: 40px 18px minmax(0, 1fr)", ".cap-stable-skim-content > .cap-skim-view.is-embedded", "@media (max-height: 359.98px)"]) {
  assert.ok(panelStyles.includes(marker), `Stable Skim panel styles are missing ${marker}.`);
}
assert.doesNotMatch(`${shellSource}\n${slotSource}\n${toolbarSource}\n${contractSource}`, /window\.cap7ce|setShellState|navigateTo\("skim"\)/);

console.log(JSON.stringify({
  singleSkimControllerReused: true,
  searchAndSkimRemainOrthogonal: true,
  skimClosedUntilExplicitToggle: true,
  pathBreadcrumbSortAndScopeControlsVerified: true,
  formalVirtualGridAndFileActionsReused: true,
  hiddenPanelKeyboardIsolationVerified: true,
  responsiveSkimPanelVerified: true
}));
