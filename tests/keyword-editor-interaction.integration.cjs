const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  clampFloatingCardPosition,
  centerFloatingCardPosition,
  createSpaceHoldController,
  createSpaceReleaseGuard,
  getKeywordEditorTextareaMaximumHeight,
  getKeywordEditorTextareaMinimumHeight,
  getKeywordEditorExitDelay,
  isKeywordEditorCancelKey,
  isPlainSpaceShortcut,
  shouldSubmitKeywordEditor
} = require("../src/renderer/keywordEditorInteraction.ts");
const { normalizeKeywordList, parseKeywordText } = require("../electron/keywordRules.ts");
const { getCommonKeywords } = require("../src/renderer/dialogs/keywordEditorModel.ts");

const resultsViewSource = fs.readFileSync(
  path.join(__dirname, "../src/renderer/results/ResultsView.tsx"),
  "utf8"
);
const keywordEditorBackdropSource = fs.readFileSync(
  path.join(__dirname, "../src/renderer/dialogs/KeywordEditorBackdrop.tsx"),
  "utf8"
);
const keywordEditorBackdropCss = fs.readFileSync(
  path.join(__dirname, "../src/renderer/dialogs/KeywordEditorBackdrop.css"),
  "utf8"
);

assert.doesNotMatch(
  resultsViewSource,
  /window\.removeEventListener\("blur", cancelSpaceHold\);\s*spaceHoldController\.cancel\(\);/,
  "refreshing result keyboard listeners must not cancel an in-progress Space hold"
);
assert.match(keywordEditorBackdropSource, /data-keyword-editor-backdrop="true"/);
assert.match(keywordEditorBackdropCss, /\.keyword-editor-backdrop-dark\s*\{[^}]*rgb\(0 0 0 \/ 0\.22\)/s);
assert.match(keywordEditorBackdropCss, /\.keyword-editor-backdrop-light\s*\{[^}]*rgb\(255 255 255 \/ 0\.28\)/s);
assert.match(keywordEditorBackdropCss, /border-radius: var\(--radius-window-normal\)/);
assert.match(keywordEditorBackdropCss, /\.cap-shell-maximized[^}]*border-radius: 0/s);

const position = clampFloatingCardPosition(
  { x: 790, y: 590 },
  { width: 280, height: 160 },
  { width: 800, height: 600 }
);
assert.deepEqual(position, { left: 515, top: 435 });
assert.deepEqual(
  centerFloatingCardPosition(
    { width: 280, height: 140 },
    { width: 540, height: 156 }
  ),
  { left: 130, top: 8 }
);
assert.deepEqual(
  centerFloatingCardPosition(
    { width: 280, height: 160 },
    { width: 200, height: 120 }
  ),
  { left: 5, top: 5 }
);

assert.equal(isPlainSpaceShortcut({
  code: "Space",
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false
}), true);
assert.equal(isPlainSpaceShortcut({
  code: "Space",
  ctrlKey: true,
  altKey: false,
  shiftKey: false,
  metaKey: false
}), false);

assert.equal(shouldSubmitKeywordEditor({ key: "Enter", isComposing: true, repeat: false }), false);
assert.equal(shouldSubmitKeywordEditor({ key: "Enter", isComposing: false, repeat: false }), true);
assert.equal(shouldSubmitKeywordEditor({ key: "Enter", isComposing: false, repeat: true }), false);
assert.equal(isKeywordEditorCancelKey("Escape"), true);
assert.equal(isKeywordEditorCancelKey("Enter"), false);
assert.equal(getKeywordEditorTextareaMinimumHeight(156), 60);
assert.equal(getKeywordEditorTextareaMaximumHeight(156), 60);
assert.equal(getKeywordEditorTextareaMinimumHeight(420), 76);
assert.equal(getKeywordEditorTextareaMaximumHeight(420), 160);
assert.equal(getKeywordEditorExitDelay(false), 180);
assert.equal(getKeywordEditorExitDelay(true), 0);

assert.deepEqual(
  normalizeKeywordList(parseKeywordText(" 海报，产品A,海报, , 产品A ")),
  ["海报", "产品A"]
);
assert.deepEqual(normalizeKeywordList(parseKeywordText("， ,  ")), []);
assert.deepEqual(getCommonKeywords([]), []);
assert.deepEqual(getCommonKeywords([
  { keywords: ["海报", "产品", "海报"] },
  { keywords: ["产品", "海报", "人物"] },
  { keywords: ["海报", "产品"] }
]), ["海报", "产品"]);

const spaceReleaseGuard = createSpaceReleaseGuard();
assert.equal(spaceReleaseGuard.shouldSuppressKeyDown("Space"), false);
spaceReleaseGuard.activate();
assert.equal(spaceReleaseGuard.shouldSuppressKeyDown("Space"), true);
assert.equal(spaceReleaseGuard.shouldSuppressKeyDown("KeyA"), false);
assert.equal(spaceReleaseGuard.consumeKeyUp("KeyA"), false);
assert.equal(spaceReleaseGuard.shouldSuppressKeyDown("Space"), true);
assert.equal(spaceReleaseGuard.consumeKeyUp("Space"), true);
assert.equal(spaceReleaseGuard.shouldSuppressKeyDown("Space"), false);

const scheduled = [];
const shortPresses = [];
const longPresses = [];
const controller = createSpaceHoldController({
  delayMs: 350,
  schedule: (callback, delayMs) => {
    const task = { callback, delayMs, cancelled: false };
    scheduled.push(task);
    return task;
  },
  cancelScheduled: (task) => {
    task.cancelled = true;
  },
  onShortPress: (value) => shortPresses.push(value),
  onLongPress: (value) => longPresses.push(value)
});

assert.equal(controller.start("short"), true);
assert.equal(controller.start("repeat"), false);
assert.equal(scheduled[0].delayMs, 350);
assert.equal(controller.release(), true);
assert.deepEqual(shortPresses, ["short"]);
assert.deepEqual(longPresses, []);

assert.equal(controller.start("long"), true);
scheduled[1].callback();
assert.deepEqual(longPresses, ["long"]);
assert.equal(controller.release(), true);
assert.deepEqual(shortPresses, ["short"]);

assert.equal(controller.start("cancelled"), true);
assert.equal(controller.cancel(), true);
scheduled[2].callback();
assert.deepEqual(longPresses, ["long"]);

const updatedLongPresses = [];
assert.equal(controller.start("rerendered"), true);
controller.updateHandlers({
  onShortPress: (value) => shortPresses.push(`updated:${value}`),
  onLongPress: (value) => updatedLongPresses.push(value)
});
scheduled[3].callback();
assert.deepEqual(longPresses, ["long"]);
assert.deepEqual(updatedLongPresses, ["rerendered"]);
controller.release();

const guardedReleaseAfterPendingCancel = createSpaceReleaseGuard();
guardedReleaseAfterPendingCancel.activate();
assert.equal(controller.start("opened-editor"), true);
assert.equal(controller.cancel(), true);
assert.equal(guardedReleaseAfterPendingCancel.shouldSuppressKeyDown("Space"), true);
assert.equal(guardedReleaseAfterPendingCancel.consumeKeyUp("Space"), true);
assert.equal(guardedReleaseAfterPendingCancel.shouldSuppressKeyDown("Space"), false);

console.log("keyword editor interaction integration passed");
