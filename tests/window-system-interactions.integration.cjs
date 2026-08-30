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
assert.match(appSource, /const enterStandby = useCallback\(\(\) => \{[\s\S]*?isAddingDirectory \|\| isClearingCache \|\| isClearingSkimCache[\s\S]*?isDeletingFiles \|\| isSavingMetadata \|\| keywordSaveInFlightRef\.current[\s\S]*?directoryDeleteInFlightRef\.current[\s\S]*?dismissTransientInteractionsForStandby\(\);[\s\S]*?setShellState\("standby"\);/u);
assert.match(mainSource, /const applyStandaloneLineMode = \(\) => \{[\s\S]*?mainWindow\.hide\(\);\s*if \(standbyLineVisible\) \{\s*lineWindowController\.show\(\);/u);
assert.match(mainSource, /mainWindow\.on\("minimize", \(\) => discardQueuedInteractiveThumbnailRenders\(\)\)/u);
assert.match(mainSource, /compatibilityNativeMaximizeController\.attach\(mainWindow\);/u);
assert.match(mainSource, /appTray\.on\("click", \(\) => void activateShellModeShortcut\("normal"\)\)/u);
assert.match(mainSource, /appTray\.on\("balloon-click", \(\) => openSettingsFromTray\(\)\)/u);
assert.match(mainSource, /app\.on\("second-instance", \(\) => \{[\s\S]*?pendingSecondInstanceActivation = true;[\s\S]*?void activateShellModeShortcut\("normal"\);/u);
assert.match(mainSource, /mainWindow\.once\("ready-to-show", \(\) => \{[\s\S]*?if \(pendingSecondInstanceActivation\) \{[\s\S]*?void activateShellModeShortcut\("normal"\);/u);
assert.match(mainSource, /\{ id: "activateMicro", shortcut: shortcutActions\.activateMicro, mode: "micro" \}[\s\S]*?\{ id: "activateMini", shortcut: shortcutActions\.activateMini, mode: "mini" \}[\s\S]*?\{ id: "activateNormal", shortcut: shortcutActions\.activateNormal, mode: "normal" \}[\s\S]*?\{ id: "activateStandby", shortcut: shortcutActions\.activateStandby, mode: "standby" \}/u);

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
