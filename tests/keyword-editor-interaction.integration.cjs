const assert = require("node:assert/strict");
const {
  clampFloatingCardPosition,
  createSpaceHoldController,
  getKeywordEditorTextareaMaximumHeight,
  getKeywordEditorTextareaMinimumHeight,
  isKeywordEditorCancelKey,
  isPlainSpaceShortcut,
  shouldSubmitKeywordEditor
} = require("../src/renderer/keywordEditorInteraction.ts");
const { normalizeKeywordList, parseKeywordText } = require("../electron/keywordRules.ts");

const position = clampFloatingCardPosition(
  { x: 790, y: 590 },
  { width: 280, height: 160 },
  { width: 800, height: 600 }
);
assert.deepEqual(position, { left: 515, top: 435 });

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

assert.deepEqual(
  normalizeKeywordList(parseKeywordText(" 海报，产品A,海报, , 产品A ")),
  ["海报", "产品A"]
);
assert.deepEqual(normalizeKeywordList(parseKeywordText("， ,  ")), []);

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

console.log("keyword editor interaction integration passed");
