const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");
const appSource = fs.readFileSync(path.join(root, "src", "renderer", "App.tsx"), "utf8");

assert.match(mainSource, /const requestSafeMainWindowHide = \(\) => sendActivateShellModeShortcutToRenderer\("standby"\);/u);
assert.match(mainSource, /if \(mode === "standby"\) \{\s*return requestSafeMainWindowHide\(\);\s*\}/u);
assert.match(mainSource, /mainWindow\.on\("close", \(event\) => \{\s*if \(isQuitting\) \{\s*return;\s*\}\s*event\.preventDefault\(\);\s*requestSafeMainWindowHide\(\);\s*\}\);/u);
assert.doesNotMatch(mainSource, /mainWindow\.on\("close",[\s\S]{0,220}?mainWindow\?\.hide\(\)/u);
assert.match(appSource, /const enterStandby = useCallback\(\(\) => \{[\s\S]*?isAddingDirectory[\s\S]*?isDeletingFiles \|\| isSavingMetadata \|\| keywordSaveInFlightRef\.current[\s\S]*?directoryDeleteInFlightRef\.current[\s\S]*?dismissTransientInteractionsForStandby\(\);[\s\S]*?window\.cap7ce\?\.window\.setShellState\("standby"\)/u);
assert.match(mainSource, /const applyStandaloneLineMode = \(\) => \{[\s\S]*?mainWindow\.hide\(\);\s*if \(standbyLineVisible\) \{\s*lineWindowController\.show\(\);/u);
assert.match(mainSource, /mainWindow\.on\("minimize", \(\) => discardQueuedInteractiveThumbnailRenders\(\)\)/u);
assert.match(mainSource, /compatibilityNativeMaximizeController\.attach\(mainWindow\);/u);
assert.match(mainSource, /appTray\.on\("click", \(\) => void activateShellModeShortcut\("normal"\)\)/u);
assert.match(mainSource, /appTray\.on\("balloon-click", \(\) => void openSettings\(\)\)/u);
assert.match(mainSource, /app\.on\("second-instance", \(\) => \{[\s\S]*?pendingSecondInstanceActivation = true;[\s\S]*?void activateShellModeShortcut\("normal"\);/u);
assert.match(mainSource, /mainWindow\.once\("ready-to-show", \(\) => \{[\s\S]*?if \(pendingSecondInstanceActivation\) \{[\s\S]*?void activateShellModeShortcut\("normal"\);/u);
assert.match(mainSource, /\{ id: "activateStandby", shortcut: shortcutActions\.activateStandby, mode: "standby" \}[\s\S]*?\{ id: "activateSkim", shortcut: shortcutActions\.activateSkim, mode: "skim" \}[\s\S]*?\{ id: "openSettings", shortcut: shortcutActions\.openSettings, mode: "settings" \}[\s\S]*?\{ id: "activateNormal", shortcut: shortcutActions\.activateNormal, mode: "normal" \}/u);
assert.doesNotMatch(mainSource, /mode: "micro"|mode: "mini"/u);

console.log(JSON.stringify({
  nativeCloseUsesSafeRendererRequest: true,
  activeTasksCanBlockNativeClose: true,
  lineAppearsOnlyAfterMainHide: true,
  minimizeRemainsNativeOnly: true,
  nativeMaximizeControllerPreserved: true,
  trayAndNotificationUseRestoreEntry: true,
  secondInstanceUsesRestoreEntry: true,
  earlySecondInstanceDeferredUntilReady: true,
  altModeShortcutsShareMainWindowEntry: true,
  realQuitBypassesHideRequest: true
}));
