const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");
const controllerSource = fs.readFileSync(path.join(root, "electron", "lineWindowController.ts"), "utf8");

assert.match(mainSource, /if \(standbyLineVisible\) \{\s*lineWindowController\.create\(\);\s*\}/u);
assert.match(mainSource, /if \(standbyLineVisible\) \{[\s\S]*?lineWindowController\.create\(\);[\s\S]*?\} else \{\s*lineWindowController\.destroy\(\);\s*\}/u);
assert.match(mainSource, /lineWindowController\.ownsWebContents\(event\.sender\.id\)/u);
assert.match(mainSource, /standbyLineVisible[\s\S]*?!mainWindow\.isVisible\(\)[\s\S]*?!previewWindow\.isVisible\(\)/u);

assert.match(controllerSource, /private lineWindow: BrowserWindow \| null = null/u);
assert.match(controllerSource, /if \(!this\.lineWindow \|\| this\.lineWindow\.isDestroyed\(\)\) \{[\s\S]*?this\.create\(\);\s*return false;/u);
assert.match(controllerSource, /const targetWindow = this\.lineWindow;\s*this\.lineWindow = null;[\s\S]*?targetWindow\.destroy\(\)/u);
assert.match(controllerSource, /if \(this\.options\.shouldShow\(\)\) this\.show\(\)/u);
assert.match(controllerSource, /loadPromise\.then\(\(\) => \{\s*if \(this\.lineWindow === createdWindow && this\.options\.shouldShow\(\)\) this\.show\(\)/u);
assert.doesNotMatch(controllerSource, /show\(\)[\s\S]*?isLoadingMainFrame\(\)[\s\S]*?showInactive\(\)/u);

console.log(JSON.stringify({
  startupCreationGuardedByPreference: true,
  runtimeDisableDestroysLineRenderer: true,
  runtimeEnableRecreatesLineRenderer: true,
  hiddenMainWindowAllowsImmediateLineReveal: true,
  visibleMainOrPreviewWindowBlocksLineReveal: true,
  completedRuntimeLoadRetriesLineReveal: true,
  transparentLineCanRevealWhileRendererLoads: true,
  lineActivationSenderGuardPreserved: true
}));
