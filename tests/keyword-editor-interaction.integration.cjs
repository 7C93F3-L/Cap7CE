const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  clampFloatingCardPosition,
  centerFloatingCardPosition,
  getKeywordEditorTextareaMaximumHeight,
  getKeywordEditorTextareaMinimumHeight,
  getKeywordEditorExitDelay,
  isKeywordEditorCancelKey,
  isPlainSpaceShortcut,
  shouldSubmitKeywordEditor
} = require("../src/renderer/keywordEditorInteraction.ts");
const { normalizeKeywordList, parseKeywordText } = require("../dist-electron/keywordRules.js");
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
const keywordEditorCardCss = fs.readFileSync(
  path.join(__dirname, "../src/renderer/dialogs/KeywordEditorCard.css"),
  "utf8"
);
const keywordEditorCardSource = fs.readFileSync(
  path.join(__dirname, "../src/renderer/dialogs/KeywordEditorCard.tsx"),
  "utf8"
);

assert.doesNotMatch(resultsViewSource, /useResultsSpaceHold|startSpaceHold|onLongPress/u);
assert.match(resultsViewSource, /isPlainSpaceShortcut\(event\)[\s\S]*?openPreviewAtIndex\(selectedImageIndex\)/u);
assert.doesNotMatch(resultsViewSource, /createSpaceHoldController|createSpaceReleaseGuard|releaseGuardRef/u);
assert.match(keywordEditorBackdropSource, /data-keyword-editor-backdrop="true"/);
assert.match(keywordEditorBackdropCss, /\.keyword-editor-backdrop-dark\s*\{[^}]*rgb\(0 0 0 \/ 0\.22\)/s);
assert.match(keywordEditorBackdropCss, /\.keyword-editor-backdrop-light\s*\{[^}]*rgb\(255 255 255 \/ 0\.28\)/s);
assert.match(keywordEditorBackdropCss, /border-radius: var\(--radius-window-normal\)/);
assert.doesNotMatch(keywordEditorBackdropCss, /cap-shell-maximized/);
assert.match(keywordEditorCardCss, /\.context-menu\.keyword-editor-card\s*\{[^}]*background: color-mix\(in srgb, var\(--panel-bg\) 95%, transparent\);[^}]*backdrop-filter: blur\(18px\)/s);
assert.match(keywordEditorCardCss, /\.keyword-editor-card \.context-menu-file-format\s*\{[^}]*font-size: var\(--cap-ui-font-heading\);/s);
assert.match(keywordEditorCardCss, /textarea\.keyword-editor-textarea\s*\{[^}]*border-radius: 12px;/s);
assert.match(keywordEditorCardCss, /textarea\.keyword-editor-textarea\s*\{[^}]*scrollbar-width: none;/s);
assert.match(keywordEditorCardCss, /textarea\.keyword-editor-textarea::\-webkit-scrollbar\s*\{[^}]*width: 0;[^}]*height: 0;/s);
assert.match(keywordEditorCardSource, /className="keyword-editor-close"[\s\S]*?tabIndex=\{-1\}[\s\S]*?onPointerDown=\{\(event\) => event\.preventDefault\(\)\}[\s\S]*?onClick=\{onCancel\}/);
assert.match(keywordEditorCardSource, /aria-label=\{t\("common\.close"\)\}/);
assert.match(keywordEditorCardCss, /\.keyword-editor-card \.keyword-editor-close\s*\{[^}]*color: color-mix\(in srgb, var\(--text-main\) 62%, transparent\);/s);
assert.match(keywordEditorCardCss, /\.keyword-editor-card \.keyword-editor-close:hover\s*\{[^}]*color: var\(--text-main\);[^}]*background: color-mix\(in srgb, var\(--text-main\) 12%, transparent\);/s);

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

console.log("keyword editor interaction integration passed");
