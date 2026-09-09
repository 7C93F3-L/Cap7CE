const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const projectRoot = path.join(__dirname, "..");
const sourcePath = path.join(projectRoot, "src", "renderer", "fileContextActions.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020
  },
  fileName: sourcePath
}).outputText;
const actionModule = new Module(sourcePath, module);
actionModule.filename = sourcePath;
actionModule.paths = Module._nodeModulePaths(path.dirname(sourcePath));
actionModule._compile(output, sourcePath);

const {
  buildFileContextMenuGroups,
  copyFilePathsWithFeedback,
  fileContextShortcutLabels,
  getFileContextShortcutAction
} = actionModule.exports;

const shortcutEvent = (overrides = {}) => ({
  altKey: false,
  code: "",
  ctrlKey: false,
  key: "",
  metaKey: false,
  shiftKey: false,
  ...overrides
});

assert.equal(getFileContextShortcutAction(shortcutEvent({ key: "Enter" })), "open");
assert.equal(getFileContextShortcutAction(shortcutEvent({ ctrlKey: true, key: "Enter" })), "showInFolder");
assert.equal(getFileContextShortcutAction(shortcutEvent({ ctrlKey: true, shiftKey: true, code: "KeyC" })), "copyPaths");
assert.equal(getFileContextShortcutAction(shortcutEvent({ ctrlKey: true, shiftKey: true, code: "KeyD" })), "addDirectory");
assert.equal(getFileContextShortcutAction(shortcutEvent({ ctrlKey: true, shiftKey: true, code: "KeyB" })), "addToSidebar");
assert.equal(getFileContextShortcutAction(shortcutEvent({ key: "Delete" })), "delete");
assert.equal(getFileContextShortcutAction(shortcutEvent({ ctrlKey: true, code: "KeyC" })), null);
assert.equal(getFileContextShortcutAction(shortcutEvent({ shiftKey: true, key: "Enter" })), null);
assert.equal(getFileContextShortcutAction(shortcutEvent({ altKey: true, key: "Enter" })), null);
assert.equal(getFileContextShortcutAction(shortcutEvent({ metaKey: true, key: "Delete" })), null);

const action = (id) => ({ id, label: id, onSelect: () => undefined });
const fullGroups = buildFileContextMenuGroups({
  actionsLabel: "Actions",
  copyPathsAction: action("copyPaths"),
  deleteAction: action("delete"),
  editKeywordsAction: action("editKeywords"),
  editKeywordsShortcut: "Hold Space",
  openAction: action("open"),
  primaryViewAction: action("preview"),
  showInFolderAction: action("showInFolder"),
  viewLabel: "View"
});

assert.deepEqual(fullGroups.map((group) => group.id), ["view", "actions"]);
assert.deepEqual(
  fullGroups.flatMap((group) => group.actions.map(({ id, shortcut }) => [id, shortcut])),
  [
    ["preview", fileContextShortcutLabels.primaryView],
    ["open", fileContextShortcutLabels.open],
    ["showInFolder", fileContextShortcutLabels.showInFolder],
    ["copyPaths", fileContextShortcutLabels.copyPaths],
    ["editKeywords", "Hold Space"],
    ["delete", fileContextShortcutLabels.delete]
  ]
);

const skimGroups = buildFileContextMenuGroups({
  additionalActions: [
    { ...action("addDirectory"), shortcut: fileContextShortcutLabels.addDirectory },
    { ...action("addToSidebar"), shortcut: fileContextShortcutLabels.addToSidebar }
  ],
  actionsLabel: "Actions",
  copyPathsAction: action("copyPaths"),
  openAction: action("open"),
  primaryViewAction: action("close"),
  showInFolderAction: action("showInFolder"),
  viewLabel: "View"
});
assert.deepEqual(
  skimGroups[1].actions.map(({ id, shortcut }) => [id, shortcut]),
  [
    ["copyPaths", fileContextShortcutLabels.copyPaths],
    ["addDirectory", fileContextShortcutLabels.addDirectory],
    ["addToSidebar", fileContextShortcutLabels.addToSidebar]
  ]
);

const appSource = fs.readFileSync(path.join(projectRoot, "src", "renderer", "App.tsx"), "utf8");
const resultsMenuSource = fs.readFileSync(path.join(projectRoot, "src", "renderer", "results", "ResultsContextMenuLayer.tsx"), "utf8");
const responsiveResultsMenuSource = fs.readFileSync(path.join(projectRoot, "src", "renderer", "results", "ResponsiveResultsContextMenuLayer.tsx"), "utf8");
const responsiveMenuSource = fs.readFileSync(path.join(projectRoot, "src", "renderer", "components", "ResponsiveFileContextMenu.tsx"), "utf8");
const responsiveMenuStyles = fs.readFileSync(path.join(projectRoot, "src", "renderer", "components", "ResponsiveFileContextMenu.css"), "utf8");
const resultsSource = fs.readFileSync(path.join(projectRoot, "src", "renderer", "results", "ResultsView.tsx"), "utf8");
const previewSource = fs.readFileSync(path.join(projectRoot, "src", "renderer", "PreviewWindowApp.tsx"), "utf8");
const skimSource = fs.readFileSync(path.join(projectRoot, "src", "renderer", "skim", "SkimView.tsx"), "utf8");
const responsiveSkimMenuSource = fs.readFileSync(path.join(projectRoot, "src", "renderer", "skim", "ResponsiveSkimContextMenuLayer.tsx"), "utf8");

assert.match(appSource, /<ResultsContextMenuLayer/);
assert.match(resultsMenuSource, /<ResponsiveResultsContextMenuLayer \{\.\.\.props\} \/>/);
assert.doesNotMatch(resultsMenuSource, /LegacyResultsContextMenuLayer|state\.responsive/);
assert.match(responsiveResultsMenuSource, /actionGroups=\{\[[\s\S]*preview[\s\S]*open[\s\S]*showInFolder[\s\S]*copyPaths[\s\S]*editKeywords[\s\S]*delete/);
for (const marker of ["compactHeightBreakpoint = 360", "stableTitlebarBottom = 45", "viewportGap = 5", "data-layout", "createPortal", "MiddleEllipsisFileName"]) {
  assert.ok(responsiveMenuSource.includes(marker), `Responsive file context menu is missing ${marker}.`);
}
assert.doesNotMatch(responsiveMenuSource, /title=\{action\.label\}/u);
assert.match(responsiveMenuStyles, /\.responsive-file-context-menu\.is-compact[\s\S]*grid-template-columns: minmax\(0, 1\.28fr\) repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(responsiveMenuStyles, /\.responsive-file-context-menu:not\(\.is-compact\) \.responsive-file-context-menu-actions \+ \.responsive-file-context-menu-actions \{ margin-top: 5px; \}/);
assert.match(responsiveMenuStyles, /button:hover:not\(:disabled\),[\s\S]*?button:focus-visible \{ background: var\(--context-menu-control-hover\); outline: 0; \}[\s\S]*?button:active:not\(:disabled\) \{ background: var\(--context-menu-control-pressed\); \}/u);
assert.doesNotMatch(responsiveMenuStyles, /button:hover:not\(:disabled\)[^}]*linear-gradient/u);
assert.match(responsiveMenuSource, /action\.shortcut[\s\S]*<kbd>/);
assert.match(responsiveResultsMenuSource, /fileContextShortcutLabels\.primaryView[\s\S]*fileContextShortcutLabels\.delete/);
assert.match(resultsSource, /getFileContextShortcutAction\s*\(event\)/);
assert.match(resultsSource, /copyFilePathsWithFeedback\(selectedItems\.map[\s\S]*?t\("clipboard\.copied"\), onFeedback\)/u);
assert.doesNotMatch(previewSource, /buildFileContextMenuGroups\s*\(/);
assert.match(previewSource, /getFileContextShortcutAction\s*\(event\)/);
assert.match(previewSource, /createSpaceHoldController<PreviewWindowData>/);
assert.match(previewSource, /onContextMenu=\{\(event\) => \{\s*event\.preventDefault\(\);\s*\}\}/);
assert.doesNotMatch(previewSource, /setContextMenu|deleteAction/);
assert.match(previewSource, /if \(previewData\.skimActive\) \{\s*closePreview\(\);/);
assert.match(previewSource, /if \(pendingLongSpaceAction\) \{\s*requestKeywordEdit\(pendingLongSpaceAction\);/);
assert.match(previewSource, /const requestKeywordEdit[\s\S]*?setPreviewKeywordEditorOpen\(true\)/);
assert.doesNotMatch(previewSource, /preview\.requestItemAction\(\{\s*action: "editKeywords"/);
assert.match(skimSource, /ResponsiveSkimContextMenuLayer/);
assert.match(skimSource, /fileShortcutAction === "addDirectory"/);
assert.match(skimSource, /fileShortcutAction === "addToSidebar"/);
assert.match(skimSource, /contextMenuSidebarAction === "remove"/);
assert.match(skimSource, /onRemoveSidebarFolders\(removableSidebarFolderPaths\)/);
assert.match(skimSource, /onRemoveSidebarFolders\(contextMenuRemovableSidebarFolderPaths\)/);
assert.equal((skimSource.match(/copyFilePathsWithFeedback\(/g) ?? []).length, 2);
assert.match(responsiveSkimMenuSource, /action\("addDirectory"/);
assert.match(responsiveSkimMenuSource, /action\("addToSidebar"/);
assert.match(responsiveSkimMenuSource, /fileContextShortcutLabels\.addDirectory[\s\S]*fileContextShortcutLabels\.addToSidebar/);

void (async () => {
  const feedback = [];
  global.window = {
    cap7ce: {
      files: {
        copyPaths: async (paths) => paths.length
      }
    }
  };
  await copyFilePathsWithFeedback(["C:\\one", "C:\\two"], "Copied", (message) => feedback.push(message));
  assert.deepEqual(feedback, ["Copied"]);
  global.window.cap7ce.files.copyPaths = async () => 0;
  await copyFilePathsWithFeedback(["C:\\one"], "Copied", (message) => feedback.push(message));
  assert.deepEqual(feedback, ["Copied"]);
  console.log("file context actions integration passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
