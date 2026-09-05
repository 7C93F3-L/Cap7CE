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
const skimViewStyles = read("src/renderer/skim/SkimView.css");
const skimViewSource = read("src/renderer/skim/SkimView.tsx");
const responsiveMenuSource = read("src/renderer/skim/ResponsiveSkimContextMenuLayer.tsx");
const rootSectionsSource = read("src/renderer/skim/SkimRootSections.tsx");
const rootSectionsStyles = read("src/renderer/skim/SkimRootSections.css");
const layoutSource = read("src/renderer/stable-ui/useStableShellLayout.ts");

assert.equal((appSource.match(/useSkimReadController\(/g) ?? []).length, 1, "Stable UI must reuse the single formal Skim read controller.");
assert.match(appSource, /renderContent: \(active\) => <SkimView \{\.\.\.createSkimViewProps\(true, active\)\} \/>/);
assert.match(appSource, /onBack: \(\) => navigateSkimParent\(false\)/);
assert.match(appSource, /sortField: skimSortPreference\.sortField, sortDirection: skimSortPreference\.sortDirection/);
assert.match(appSource, /onDisplayModeChange: \(mode\) => updateSkimDisplay\(\{ \.\.\.skimDisplay, mode \}\)/);
assert.match(appSource, /onActivateSkimRequested[\s\S]*?if \(stableUi\)[\s\S]*?setStableSkimToggleRequestId[\s\S]*?else \{[\s\S]*?openSkim\(\)/u);
assert.match(appSource, /toggleRequestId: stableSkimToggleRequestId/u);
assert.match(shellSource, /<StableSkimSlot \{\.\.\.skim\} content=\{skim\.renderContent\(skimOpen\)\} \/>/);
assert.match(shellSource, /useStableShellLayout\(skim\.onOpen, skim\.toggleRequestId\)/u);
assert.match(layoutSource, /useState\(false\)/);
assert.match(layoutSource, /handledSkimToggleRequestIdRef[\s\S]*?useEffect[\s\S]*?toggleSkim\(\)/u);
assert.match(layoutSource, /if \(!open\) onSkimOpen\(\)/);
assert.doesNotMatch(slotSource, /StablePlaceholderGrid|aria-label="Skim 布局占位区"/);

for (const marker of ["toggleRequestId", "currentPath", "breadcrumbs", "onOpenPath", "onSortChange", "onDisplayModeChange", "renderContent: (active: boolean)"]) {
  assert.ok(contractSource.includes(marker), `Stable Skim contract is missing ${marker}.`);
}
for (const marker of ["onClick={startPathEditing}", "event.target.closest(\"button\")", "onOpenRoot", "breadcrumb.path", "cap-stable-skim-address-hit-area", "sortField", "displayMode"]) {
  assert.ok(toolbarSource.includes(marker), `Stable Skim toolbar is missing ${marker}.`);
}
for (const marker of ["embedded?: boolean", "responsiveLayout?: boolean", "active?: boolean", "if (!active) return undefined", "!embedded && <Cap7CESearchCapsule", "window.matchMedia(\"(max-height: 359.98px)\")"]) {
  assert.ok(skimViewSource.includes(marker), `Formal Skim view bridge is missing ${marker}.`);
}
for (const marker of ["embedded && currentPath === null", "<SkimRootSections", "rootLocations: SkimLocationShortcut[]", "onToggleSystemLocations"]) {
  assert.ok(skimViewSource.includes(marker), `Stable Skim root bridge is missing ${marker}.`);
}
for (const marker of ["skim.root.systemLocations", "skim.root.starredFolders", "skim.root.thisPc", "starredLocationsCollapsed", "drivesCollapsed", "onStarredContextMenu"]) {
  assert.ok(rootSectionsSource.includes(marker), `Stable Skim root sections are missing ${marker}.`);
}
assert.match(rootSectionsStyles, /\.cap-skim-root-sections\s*\{[\s\S]*?display: grid/u);
assert.match(rootSectionsStyles, /\.cap-skim-root-group-grid\s*\{[\s\S]*?width: 100%;[\s\S]*?repeat\(auto-fill, minmax\(var\(--cap-grid-target-size, 120px\), 1fr\)\)/u);
assert.match(rootSectionsStyles, /\.cap-skim-root-group-header\s*\{[\s\S]*?width: 100%;[\s\S]*?cursor: pointer/u);
assert.match(rootSectionsStyles, /\.cap-skim-view\.is-horizontal \.cap-skim-root-sections\s*\{[\s\S]*?display: flex/u);
assert.match(skimViewStyles, /\.cap-stable-skim-content \.cap-skim-grid-virtualized\s*\{\s*display: block;\s*\}/u);
assert.match(skimViewSource, /responsiveSkimGridTargetThumbSize = 120/u);
assert.match(skimViewSource, /targetThumbSize: gridTargetThumbSize/u);
for (const marker of ["window.cap7ce?.files.startDrag", "ResponsiveSkimContextMenuLayer", "resolveFileContentPreview", "CustomScrollbar"]) {
  assert.ok(skimViewSource.includes(marker), `Formal Skim file capability is missing ${marker}.`);
}
for (const marker of ["ResponsiveFileContextMenu", "fileInfo.compactContents", "addDirectory", "addToSidebar"]) {
  assert.ok(responsiveMenuSource.includes(marker), `Responsive Skim context menu is missing ${marker}.`);
}
for (const marker of ["skim.sidebar.starFolder", "skim.sidebar.starContainingFolder", "skim.sidebar.unstarFolder"]) {
  assert.ok(responsiveMenuSource.includes(marker), `Responsive Skim menu is missing ${marker}.`);
}
for (const marker of ["grid-template-rows: 40px 18px minmax(0, 1fr)", ".cap-stable-skim-content > .cap-skim-view.is-embedded", "@media (max-height: 359.98px)"]) {
  assert.ok(panelStyles.includes(marker), `Stable Skim panel styles are missing ${marker}.`);
}
assert.match(
  panelStyles,
  /\.cap-stable-skim-content \.cap-skim-entry:hover,\s*\.cap-stable-skim-content \.cap-skim-entry:focus-visible\s*\{\s*background: var\(--cap-stable-skim-hover-surface\);\s*\}/u,
  "Stable Skim entries should use the stronger stable surface when hovered or keyboard-focused."
);
assert.match(panelStyles, /\.cap-stable-skim-content \.cap-skim-entry\.selected\s*\{\s*background: var\(--cap-stable-selected-surface\);\s*\}/u);
assert.match(panelStyles, /\.cap-stable-skim-content \.cap-skim-entry\s*\{[^}]*background: var\(--cap-stable-grid-surface\);/u);
assert.match(panelStyles, /--cap-stable-selected-surface: light-dark\(rgb\(255 255 255 \/ 68%\), rgb\(26 26 26 \/ 68%\)\);/u);
assert.match(panelStyles, /\.cap-stable-skim-address > \.cap-stable-skim-address-hit-area\s*\{[^}]*min-width: 24px;[^}]*flex: 0 0 24px;/u);
assert.match(panelStyles, /\.cap-stable-skim-address > button:focus-visible,[^\n]*\.cap-stable-skim-address input:focus-visible\s*\{[^}]*outline: none;[^}]*box-shadow: none;/u);
assert.doesNotMatch(`${shellSource}\n${slotSource}\n${toolbarSource}\n${contractSource}`, /window\.cap7ce|setShellState|navigateTo\("skim"\)/);

console.log(JSON.stringify({
  singleSkimControllerReused: true,
  searchAndSkimRemainOrthogonal: true,
  skimClosedUntilExplicitToggle: true,
  pathBreadcrumbSortAndScopeControlsVerified: true,
  formalVirtualGridAndFileActionsReused: true,
  responsiveSkimGridTargetVerified: true,
  hiddenPanelKeyboardIsolationVerified: true,
  responsiveSkimPanelVerified: true
}));
