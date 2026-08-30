const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");
const controllerSource = fs.readFileSync(path.join(root, "electron", "capsuleWindowController.ts"), "utf8");
const preloadSource = fs.readFileSync(path.join(root, "electron", "preload.ts"), "utf8");
const appSource = fs.readFileSync(path.join(root, "src", "renderer", "App.tsx"), "utf8");
const capsuleAppSource = fs.readFileSync(path.join(root, "src", "renderer", "CompatibilityCapsuleWindowApp.tsx"), "utf8");
const sharedCapsuleSource = fs.readFileSync(path.join(root, "src", "renderer", "search", "QuickSearchCapsule.tsx"), "utf8");
const bridgeSource = fs.readFileSync(path.join(root, "src", "renderer", "window-presentation", "useCompatibilityCapsuleBridge.ts"), "utf8");
const { getAnchoredCapsuleBounds } = require(path.join(root, "dist-electron", "capsuleWindowController.js"));

assert.deepEqual(
  getAnchoredCapsuleBounds(
    { x: 810, y: 1001, width: 300, height: 34 },
    { x: 810, y: 1001, width: 300, height: 39 },
    "bottom"
  ),
  { x: 810, y: 996, width: 300, height: 39 }
);
assert.deepEqual(
  getAnchoredCapsuleBounds(
    { x: 810, y: 5, width: 300, height: 34 },
    { x: 810, y: 5, width: 300, height: 39 },
    "top"
  ),
  { x: 810, y: 5, width: 300, height: 39 }
);

assert.match(controllerSource, /frame: false, transparent: true/u);
assert.match(controllerSource, /show: false, skipTaskbar: true/u);
assert.match(controllerSource, /resizable: false, movable: false, minimizable: false, maximizable: false/u);
assert.match(controllerSource, /query: \{ window: "compatibility-capsule" \}/u);
assert.match(controllerSource, /this\.ownsCapsuleSender\(event\.sender\.id\)/u);
assert.match(controllerSource, /this\.options\.isMainSender\(event\.sender\.id\) && this\.updatePresentation\(value\)/u);
assert.match(controllerSource, /this\.composing \|\| Date\.now\(\) < this\.suppressBlurUntil/u);
assert.match(controllerSource, /this\.options\.onCancel\(false\)/u);
assert.match(controllerSource, /reconcileDisplayConfiguration\(changedDisplayId/u);

assert.match(mainSource, /windowPresentationRuntime\.mode === "compatibility" && activeShellState === "capsule"[\s\S]*?applyCapsuleWindowMode\(\)/u);
assert.match(mainSource, /closePreviewSession\(\{ restoreMain: false \}\)[\s\S]*?mainWindow\.hide\(\)[\s\S]*?capsuleWindowController\.show\(bounds\)/u);
assert.match(mainSource, /capsuleWindowController\.hide\(\);[\s\S]*?activeShellState = "standby"[\s\S]*?lineWindowController\.show\(\)/u);
assert.match(mainSource, /!capsuleWindowController\.isVisible\(\)/u);
assert.match(mainSource, /capsuleWindowController\.destroy\(\)/u);
assert.match(mainSource, /activeShellState === "capsule" && windowPresentationRuntime\.mode === "cap7ce"/u);
assert.match(mainSource, /logWindowBoundsDebug\("\[capsule before\]"[\s\S]*?mainWindow\.setBounds\(capsuleBounds, false\)/u);

assert.match(preloadSource, /capsule:syncPresentation/u);
assert.match(preloadSource, /capsule:updateDraft/u);
assert.match(preloadSource, /capsule:submit/u);
assert.match(preloadSource, /capsule:cancel/u);
assert.match(preloadSource, /capsule:setComposing/u);
assert.match(bridgeSource, /capsule\.syncPresentation\(presentation\)/u);
assert.match(bridgeSource, /capsule\.onDraftChanged\(\(query\) => callbacksRef\.current\.onDraftChange\(query\)\)/u);
assert.match(bridgeSource, /capsule\.onSubmitRequested\(\(query\) => callbacksRef\.current\.onSubmit\(query\)\)/u);
assert.match(bridgeSource, /capsule\.onCancelRequested\(\(clearQuery\) => callbacksRef\.current\.onCancel\(clearQuery\)\)/u);
assert.match(appSource, /<QuickSearchCapsule/u);
assert.match(appSource, /placeholder: searchInputFeedback,[\s\S]*?operationHintVisible,/u);
assert.match(controllerSource, /operationHintVisible: candidate\.operationHintVisible === true/u);
assert.match(capsuleAppSource, /<QuickSearchCapsule[\s\S]*?operationHintVisible=\{presentation\.operationHintVisible\}/u);
assert.match(sharedCapsuleSource, /onCompositionStart[\s\S]*?onComposingChange\?\.\(true\)/u);
assert.match(sharedCapsuleSource, /onCompositionEnd[\s\S]*?compositionGuardUntilRef\.current = Date\.now\(\) \+ 180/u);
assert.match(sharedCapsuleSource, /event\.key === "Escape"[\s\S]*?!composing\) onCancel\(\)/u);

console.log(JSON.stringify({
  compatibilityCapsuleUsesIndependentHost: true,
  mainRendererRemainsSearchAuthority: true,
  capsuleIpcSendersRestricted: true,
  sharedImeAndSubmitGuardPreserved: true,
  lineMainPreviewCapsuleMutualExclusionCovered: true,
  cap7ceSameWindowCapsulePreserved: true,
  operationHintColorStateShared: true,
  displayReconciliationAndExitCleanupCovered: true,
  nativeHeightCorrectionPreservesEdgeGap: true
}));
