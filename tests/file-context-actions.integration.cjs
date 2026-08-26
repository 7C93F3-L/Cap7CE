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
const resultsSource = fs.readFileSync(path.join(projectRoot, "src", "renderer", "results", "ResultsView.tsx"), "utf8");
const previewSource = fs.readFileSync(path.join(projectRoot, "src", "renderer", "PreviewWindowApp.tsx"), "utf8");
const skimSource = fs.readFileSync(path.join(projectRoot, "src", "renderer", "skim", "SkimView.tsx"), "utf8");

assert.match(appSource, /buildFileContextMenuGroups\s*\(/);
assert.match(resultsSource, /getFileContextShortcutAction\s*\(event\)/);
assert.match(previewSource, /buildFileContextMenuGroups\s*\(/);
assert.match(previewSource, /getFileContextShortcutAction\s*\(event\)/);
assert.match(previewSource, /createSpaceHoldController<PreviewWindowData>/);
assert.match(previewSource, /if \(contextMenu\) \{\s*setContextMenu\(null\);\s*return;/);
assert.match(previewSource, /if \(previewData\.skimActive\) \{\s*closePreview\(\);/);
assert.match(previewSource, /if \(pendingLongSpaceAction\) \{\s*void window\.cap7ce\?\.preview\.requestItemAction\(\{\s*action: "editKeywords"/);
assert.match(previewSource, /deleteAction: !previewData\.skimActive/);
assert.match(skimSource, /buildFileContextMenuGroups\s*\(/);
assert.match(skimSource, /fileShortcutAction === "addDirectory"/);
assert.match(skimSource, /fileShortcutAction === "addToSidebar"/);
assert.match(skimSource, /contextMenuSidebarAction === "remove"/);
assert.match(skimSource, /onRemoveSidebarFolders\(removableSidebarFolderPaths\)/);
assert.match(skimSource, /onRemoveSidebarFolders\(contextMenuRemovableSidebarFolderPaths\)/);
assert.match(skimSource, /shortcut: fileContextShortcutLabels\.addDirectory/);
assert.match(skimSource, /shortcut: fileContextShortcutLabels\.addToSidebar/);

console.log("file context actions integration passed");
