const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");
const preloadSource = fs.readFileSync(path.join(root, "electron", "preload.ts"), "utf8");
const rendererEntrySource = fs.readFileSync(path.join(root, "src", "renderer", "main.tsx"), "utf8");
const appSource = fs.readFileSync(path.join(root, "src", "renderer", "App.tsx"), "utf8");
const settingsAppSource = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "SettingsWindowApp.tsx"), "utf8");
const settingsUpdateControlSource = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "SettingsWindowUpdateControl.tsx"), "utf8");
const settingsUpdatePresentationSource = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "settingsWindowUpdatePresentation.ts"), "utf8");
const settingsConfirmationSource = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "SettingsConfirmationDialog.tsx"), "utf8");
const settingsConfirmationControllerSource = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "useSettingsConfirmation.ts"), "utf8");
const settingsCategoryIconSource = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "SettingsCategoryIcon.tsx"), "utf8");
const dialogShellSource = fs.readFileSync(path.join(root, "src", "renderer", "dialogs", "DialogShell.tsx"), "utf8");
const settingsControllerSource = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "useSettingsWindowController.ts"), "utf8");
const formattingSource = fs.readFileSync(path.join(root, "src", "renderer", "formatting.ts"), "utf8");
const embeddedMetadataSettingsSource = fs.readFileSync(path.join(root, "src", "renderer", "settings", "EmbeddedMetadataSettingsRow.tsx"), "utf8");
const embeddedMetadataRuntimeSource = fs.readFileSync(path.join(root, "electron", "embeddedMetadataRuntime.ts"), "utf8");
const fontSizeSettingSource = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "FontSizeSetting.tsx"), "utf8");
const fontSizeSettingStyles = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "FontSizeSetting.css"), "utf8");
const stableSelectSource = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "StableSettingsSelect.tsx"), "utf8");
const stableSelectStyles = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "StableSettingsSelect.css"), "utf8");
const appearanceColorSource = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "AppearanceColorSettingsControl.tsx"), "utf8");
const appearanceColorStyles = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "AppearanceColorSettingsControl.css"), "utf8");
const stableActionStyles = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "StableSettingsActions.css"), "utf8");
const stableQuickActionStyles = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "StableQuickActionSettings.css"), "utf8");
const stableQuickCommandStyles = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "StableQuickCommandSettings.css"), "utf8");
const stableRuntimeDiagnosticStyles = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "StableRuntimeDiagnostics.css"), "utf8");
const customScrollbarStyles = fs.readFileSync(path.join(root, "src", "renderer", "CustomScrollbar.css"), "utf8");
const sharedSelectSource = fs.readFileSync(path.join(root, "src", "renderer", "settings", "SettingsSelect.tsx"), "utf8");
const sharedSelectStyles = fs.readFileSync(path.join(root, "src", "renderer", "settings", "SettingsSelect.css"), "utf8");
const colorPickerSource = fs.readFileSync(path.join(root, "src", "renderer", "ColorPickerPopover.tsx"), "utf8");
const skimDisplaySource = fs.readFileSync(path.join(root, "src", "renderer", "settings", "SkimDisplaySettingsRows.tsx"), "utf8");
const quickActionSource = fs.readFileSync(path.join(root, "src", "renderer", "settings", "QuickActionSettingsRows.tsx"), "utf8");
const shortcutActionsSource = fs.readFileSync(path.join(root, "src", "renderer", "shortcutActions.ts"), "utf8");
const quickCommandSource = fs.readFileSync(path.join(root, "src", "renderer", "settings", "QuickCommandSettingsRows.tsx"), "utf8");
const runtimeDiagnosticsSource = fs.readFileSync(path.join(root, "src", "renderer", "settings", "RuntimeDiagnosticsRows.tsx"), "utf8");
const settingsStyles = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "SettingsWindowApp.css"), "utf8");
const navigationStateStyles = fs.readFileSync(path.join(root, "src", "renderer", "stable-ui", "StableNavigationState.css"), "utf8");
const materialContrastStyles = fs.readFileSync(path.join(root, "src", "renderer", "stable-ui", "StableMaterialContrast.css"), "utf8");
const stableSkimStyles = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "StableSkimDisplaySettingsRows.css"), "utf8");
const settingsAccessibilityStyles = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "SettingsWindowAccessibility.css"), "utf8");
const preferenceIpcSource = fs.readFileSync(path.join(root, "electron", "preferenceIpc.ts"), "utf8");
const directoryIpcSource = fs.readFileSync(path.join(root, "electron", "directoryManagementIpc.ts"), "utf8");
const appUpdateIpcSource = fs.readFileSync(path.join(root, "electron", "appUpdateIpc.ts"), "utf8");
const architectureSource = fs.readFileSync(path.join(root, "docs", "SOFTWARE_ARCHITECTURE.md"), "utf8");
const featureDocSource = fs.readFileSync(path.join(root, "docs", "STABLE_UI_SETTINGS_WINDOW.md"), "utf8");
const { SettingsWindowController } = require("../dist-electron/settingsWindowController.js");
const { registerSettingsWindowIpc } = require("../dist-electron/settingsWindowIpc.js");
const { createSettingsDataBroadcaster } = require("../dist-electron/settingsDataBroadcast.js");
const {
  SettingsWindowLayoutStore,
  createSettingsWindowLayoutProfile,
  resolveSettingsWindowInitialBounds
} = require("../dist-electron/settingsWindowLayout.js");

class FakeWindow {
  constructor(options) {
    this.options = options;
    this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height };
    this.destroyed = false;
    this.minimized = false;
    this.visible = false;
    this.focused = false;
    this.maximized = false;
    this.listeners = new Map();
    this.onceListeners = new Map();
    this.calls = [];
    this.sent = [];
    this.webContents = {
      isDestroyed: () => false,
      send: (...args) => { this.sent.push(args); },
      setWindowOpenHandler: (handler) => { this.windowOpenHandler = handler; }
    };
  }
  isDestroyed() { return this.destroyed; }
  isMinimized() { return this.minimized; }
  isVisible() { return this.visible; }
  isFocused() { return this.focused; }
  isMaximized() { return this.maximized; }
  restore() { this.minimized = false; this.calls.push("restore"); }
  show() { this.visible = true; this.calls.push("show"); }
  focus() { this.focused = true; this.calls.push("focus"); }
  hide() { this.visible = false; this.focused = false; this.calls.push("hide"); }
  destroy() { this.destroyed = true; this.emit("closed"); }
  getBounds() { return { ...this.bounds }; }
  setBounds(bounds) { this.bounds = { ...bounds }; this.calls.push("setBounds"); }
  setMenuBarVisibility() {}
  loadURL(url) { this.loaded = url; return Promise.resolve(); }
  loadFile(filePath, options) { this.loaded = { filePath, options }; return Promise.resolve(); }
  on(event, listener) { this.listeners.set(event, listener); }
  once(event, listener) { this.onceListeners.set(event, listener); }
  emit(event, ...args) {
    this.listeners.get(event)?.(...args);
    const once = this.onceListeners.get(event);
    if (once) { this.onceListeners.delete(event); once(...args); }
  }
}

const displays = [
  { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 },
  { id: 2, bounds: { x: 1920, y: 0, width: 1280, height: 1024 }, workArea: { x: 1920, y: 0, width: 1280, height: 984 }, scaleFactor: 1.25 }
];

assert.deepEqual(resolveSettingsWindowInitialBounds(null, displays, displays[0]), { x: 530, y: 180, width: 860, height: 680 });
const remembered = createSettingsWindowLayoutProfile({ x: 2050, y: 100, width: 900, height: 700 }, displays[1], "2026-09-02T00:00:00.000Z");
assert.equal(resolveSettingsWindowInitialBounds(remembered, displays, displays[0]).x >= displays[1].workArea.x, true);
const recoveredAfterDisplayRemoval = resolveSettingsWindowInitialBounds(remembered, [displays[0]], displays[0]);
assert.equal(recoveredAfterDisplayRemoval.x + recoveredAfterDisplayRemoval.width <= displays[0].workArea.width, true);

(async () => {
  const handles = new Map();
  registerSettingsWindowIpc({
    registrar: { handle: (channel, listener) => handles.set(channel, listener), on: () => undefined },
    isMainSenderAllowed: (event) => event.sender.id === 1,
    openSettings: async () => true
  });
  assert.equal(await handles.get("settingsWindow:open")({ sender: { id: 2 } }), false);
  assert.equal(await handles.get("settingsWindow:open")({ sender: { id: 1 } }), true);

  const temporaryRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "cap7ce-settings-window-"));
  const layoutPath = path.join(temporaryRoot, "settings-window-layout.json");
  const store = new SettingsWindowLayoutStore(layoutPath);
  await store.load();
  store.setProfile(remembered);
  await store.flush();
  assert.deepEqual((await new SettingsWindowLayoutStore(layoutPath).load()).profile, remembered);

  const created = [];
  const controller = new SettingsWindowController({
    createWindow: (options) => { const window = new FakeWindow(options); created.push(window); return window; },
    browserOptions: () => ({ frame: false, transparent: false }),
    devServerUrl: "http://127.0.0.1:5173",
    devToolsEnabled: true,
    getDisplayMatching: (bounds) => bounds.x >= displays[1].bounds.x ? displays[1] : displays[0],
    getDisplays: () => displays,
    getPrimaryDisplay: () => displays[0],
    isQuitting: () => false,
    layoutStore: store,
    lockWebContentsZoom: () => undefined,
    preloadPath: "preload.js",
    rendererPath: "index.html"
  });
  assert.equal(await controller.open(), true);
  assert.equal(created.length, 1);
  created[0].emit("ready-to-show");
  assert.equal(controller.isVisibleAndFocused(), true);
  created[0].minimized = true;
  assert.equal(await controller.open(), true);
  assert.equal(created.length, 1);
  assert.deepEqual(created[0].calls.slice(-3), ["restore", "show", "focus"]);
  assert.equal(controller.send("preferences:changed", { themePreference: "dark" }), true);
  assert.deepEqual(created[0].sent.at(-1), ["preferences:changed", { themePreference: "dark" }]);
  assert.equal(controller.getWebContents(), created[0].webContents);
  const closeEvent = { prevented: false, preventDefault() { this.prevented = true; } };
  created[0].emit("close", closeEvent);
  assert.equal(closeEvent.prevented, true);
  assert.equal(created[0].visible, false);
  assert.equal(controller.isVisibleAndFocused(), false);
  assert.match(created[0].loaded, /window=settings/u);
  await controller.flush();

  const broadcasts = [];
  const broadcastSettingsData = createSettingsDataBroadcaster({
    sendToMain: (channel, value) => broadcasts.push(["main", channel, value]),
    sendToSettings: (channel, value) => broadcasts.push(["settings", channel, value]),
    sendToPreview: (channel, value) => broadcasts.push(["preview", channel, value])
  });
  const canonicalPreferences = { languagePreference: "zh-CN" };
  assert.equal(broadcastSettingsData("preferences:changed", canonicalPreferences), canonicalPreferences);
  assert.deepEqual(broadcasts, [["main", "preferences:changed", canonicalPreferences], ["settings", "preferences:changed", canonicalPreferences], ["preview", "preferences:changed", canonicalPreferences]]);

  assert.match(rendererEntrySource, /windowKind === "settings"[\s\S]*?import\("\.\/settings-window\/SettingsWindowApp"\)/u);
  assert.match(settingsAppSource, /categoryDefinitions[\s\S]*?"general"[\s\S]*?"appearance"[\s\S]*?"browse"[\s\S]*?"cache"[\s\S]*?"shortcuts"[\s\S]*?"search-ai"[\s\S]*?"diagnostics"[\s\S]*?"about"/u);
  assert.match(settingsAppSource, /useSettingsWindowController/u);
  assert.match(settingsAppSource, /formatThumbnailOptimizationStatus\(controller\.thumbnailOptimizationStatus\)/u);
  assert.match(settingsAppSource, /settings\.edgeCollapse[\s\S]*?settings\.standardWindowMode[\s\S]*?settings\.edgeCollapseMode/u);
  assert.match(settingsAppSource, /<StableSettingsSelect[^>]*label=\{t\("settings\.edgeCollapse"\)\}[^>]*value=\{preferences\.edgeCollapseEnabled \? "edge-collapse" : "standard"\}[^>]*settings\.standardWindowMode[^>]*settings\.edgeCollapseMode[^>]*onChange=\{\(value\) => toggle\("edgeCollapseEnabled", value === "edge-collapse"\)\}/u);
  assert.match(mainSource, /edgeCollapseEnabled \? t\("tray\.disableEdgeCollapse"\) : t\("tray\.enableEdgeCollapse"\)/u);
  assert.match(formattingSource, /status\.phase === "discovering"[\s\S]*?stableSettings\.optimizationChecking[\s\S]*?stableSettings\.optimizationNoWork[\s\S]*?stableSettings\.optimizationCompleted/u);
  assert.match(settingsAppSource, /SettingsWindowUpdateControl/u);
  assert.match(settingsAppSource, /category === "appearance"[\s\S]*?stableSettings\.material[\s\S]*?appearance\.themeModeLabel[\s\S]*?appearance\.configureLabel[\s\S]*?stableSettings\.uiFontSize/u);
  assert.doesNotMatch(settingsAppSource, /<select|type="color"/u);
  assert.match(settingsAppSource, /<StableSettingsSelect[\s\S]*?menuStyle=\{menuStyle\}/u);
  assert.match(settingsAppSource, /<AppearanceColorSettingsControl[\s\S]*?onPreview=\{controller\.previewAppearanceColors\}/u);
  assert.match(appearanceColorSource, /cap-stable-settings-colors[\s\S]*?themeColor[\s\S]*?accentColor[\s\S]*?cap-stable-settings-button[\s\S]*?common\.restoreDefault/u);
  assert.match(appearanceColorSource, /defaultAppearanceColors[\s\S]*?onChange\(defaultAppearanceColors\)/u);
  assert.match(stableSelectSource, /<SettingsSelect[\s\S]*?menuClassName="cap-stable-settings-select-menu"/u);
  assert.match(sharedSelectSource, /menuClassName\?[\s\S]*?cap-settings-select-menu\$\{menuClassName/u);
  assert.match(stableSelectStyles, /cap-stable-settings-select-menu[\s\S]*?backdrop-filter[\s\S]*?linear-gradient/u);
  assert.match(stableSelectStyles, /\.context-menu\.cap-stable-settings-select-menu button \{[\s\S]*?font-size: var\(--cap-ui-font-control\);[\s\S]*?line-height: var\(--cap-ui-line-control\);/u);
  assert.doesNotMatch(sharedSelectStyles, /\.cap-settings-select:focus,/u);
  assert.match(settingsAppSource, /settings\.selectRuntime[\s\S]*?cap-stable-settings-model-line[\s\S]*?settings\.visionModel[\s\S]*?cap-stable-settings-model-line/u);
  assert.match(stableSelectStyles, /cap-stable-settings-model-line[\s\S]*?width: 402px[\s\S]*?grid-template-columns: 270px 58px 58px[\s\S]*?gap: 8px[\s\S]*?width: 270px[\s\S]*?cap-stable-settings-model-actions[\s\S]*?display: contents[\s\S]*?:only-child[\s\S]*?grid-column: 3/u);
  assert.match(appearanceColorSource, /<ColorPickerPopover[\s\S]*?className="cap-stable-settings-color-picker"[\s\S]*?onPreview[\s\S]*?onCommit/u);
  assert.match(colorPickerSource, /className\?[\s\S]*?cap-color-picker\$\{className/u);
  assert.match(appearanceColorStyles, /cap-stable-settings-color-picker[\s\S]*?backdrop-filter/u);
  assert.match(stableActionStyles, /cap-stable-settings-button[\s\S]*?cap-settings-pill[\s\S]*?cap-stable-settings-color-button/u);
  assert.doesNotMatch(stableActionStyles, /cap-stable-settings-link/u);
  assert.doesNotMatch(settingsAppSource, /stableSettings\.currentVersion|cap-stable-settings-readonly/u);
  assert.match(stableActionStyles, /min-height: 28px[\s\S]*?border-radius: 999px[\s\S]*?linear-gradient\(45deg, var\(--theme-color\), var\(--accent-color\)\)/u);
  assert.match(stableActionStyles, /cap-settings-expand-toggle\[aria-expanded="true"\][\s\S]*?background: var\(--stable-settings-hover\)/u);
  assert.match(settingsAppSource, /cap-stable-settings-card-with-body[\s\S]*?<QuickActionSettingsRows quickActionGlobalEnabled=/u);
  assert.match(settingsAppSource, /cap-stable-settings-shortcut-groups[\s\S]*?cap-stable-settings-card-with-body[\s\S]*?cap-stable-settings-card-with-command-body/u);
  assert.match(quickActionSource, /className="cap-stable-settings-toggle"[\s\S]*?role="switch"[\s\S]*?aria-checked=\{quickActionGlobalEnabled\}[\s\S]*?data-checked=\{quickActionGlobalEnabled\}/u);
  assert.doesNotMatch(settingsAppSource, /quickActionsExpanded|setQuickActionsExpanded/u);
  assert.doesNotMatch(quickActionSource, /stableUi|expanded|cap-settings-expand-toggle/u);
  assert.match(quickActionSource, /shortcut\.focusMainSearch[\s\S]*?shortcut\.hideToLine[\s\S]*?shortcut\.restoreDefaultWindow[\s\S]*?shortcut\.toggleWindowMode[\s\S]*?shortcut\.toggleSkim[\s\S]*?shortcut\.openSettings[\s\S]*?shortcut\.cycleDirectory/u);
  assert.match(shortcutActionsSource, /focusMainSearch: "Alt\+`"[\s\S]*?hideToLine: "Alt\+1"[\s\S]*?restoreDefaultWindow: "Alt\+2"[\s\S]*?toggleWindowMode: "Alt\+3"[\s\S]*?toggleSkim: "Alt\+4"[\s\S]*?openSettings: "Alt\+5"/u);
  assert.match(quickActionSource, /handleShortcutCaptureOutsideClick[\s\S]*?data-shortcut-capturing="true"[\s\S]*?settings\.shortcutCaptureCancelHint/u);
  assert.doesNotMatch(quickActionSource, /isCapturing && \([\s\S]*?<button[^>]*common\.cancel/u);
  assert.match(stableQuickActionStyles, /display: contents[\s\S]*?grid-column: 2[\s\S]*?grid-column: 1 \/ -1[\s\S]*?data-shortcut-capturing="true"[\s\S]*?linear-gradient/u);
  assert.match(settingsAppSource, /cap-stable-settings-card-with-command-body[\s\S]*?<QuickCommandSettingsRows stableUi/u);
  assert.doesNotMatch(settingsAppSource, /quickCommandsExpanded|setQuickCommandsExpanded/u);
  assert.match(quickCommandSource, /if \(!stableUi && !expanded\)[\s\S]*?if \(stableUi\)[\s\S]*?cap-settings-quick-commands-panel-stable/u);
  assert.match(stableQuickCommandStyles, /grid-column: 2[\s\S]*?grid-column: 1 \/ -1[\s\S]*?column-count: 1/u);
  assert.match(stableQuickCommandStyles, /cap-settings-quick-command-groups[\s\S]*?column-gap: 24px[\s\S]*?cap-settings-quick-command-item[\s\S]*?display: contents[\s\S]*?cap-settings-quick-command-list[\s\S]*?grid-template-columns: max-content minmax\(0, 1fr\)[\s\S]*?column-gap: 10px/u);
  assert.match(stableQuickCommandStyles, /cap-settings-command-pill[\s\S]*?overflow: visible[\s\S]*?cap-settings-command-description[\s\S]*?text-overflow: clip[\s\S]*?white-space: normal/u);
  assert.match(settingsAppSource, /category === "search-ai"[\s\S]*?stableSettings\.runtimeInfo[\s\S]*?cap-stable-settings-runtime-info[\s\S]*?category === "cache"/u);
  assert.match(settingsAppSource, /category === "diagnostics"[\s\S]*?stableSettings\.diagnostics[\s\S]*?<RuntimeDiagnosticsRows stableUi \/>/u);
  assert.doesNotMatch(settingsAppSource, /category === "diagnostics"[\s\S]*?settings\.details/u);
  assert.match(runtimeDiagnosticsSource, /if \(stableUi\)[\s\S]*?cap-stable-runtime-diagnostics-list/u);
  assert.match(stableRuntimeDiagnosticStyles, /cap-stable-runtime-diagnostics-row[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)[\s\S]*?@media \(max-width: 900px\)/u);
  assert.match(settingsControllerSource, /previewAppearanceColors[\s\S]*?setPreferences/u);
  assert.match(settingsStyles, /\.cap-settings-window-foundation\s*\{[\s\S]*?font-family:\s*var\(--cap-ui-font-family\)[\s\S]*?font-size:\s*var\(--cap-ui-font-body\)/u);
  assert.doesNotMatch(settingsStyles, /\.cap-stable-settings-navigation nav button\s*\{[^}]*font-size:\s*(?:14|15|16)px/u);
  assert.match(settingsStyles, /\.cap-stable-settings-navigation nav button:hover \{[\s\S]*?background: var\(--cap-stable-navigation-state\);[\s\S]*?button\.is-active \{[\s\S]*?linear-gradient\(45deg, var\(--theme-color\) 0%, var\(--accent-color\) 100%\);/u);
  assert.match(navigationStateStyles, /\.cap-stable-ui,[\s\S]*?\.cap-settings-window-foundation[\s\S]*?--cap-stable-navigation-state: rgb\(255 255 255 \/ 50%\);[\s\S]*?theme-dark[\s\S]*?rgb\(0 0 0 \/ 24%\);/u);
  assert.match(settingsAppSource, /preferences\.windowMaterial[\s\S]*?stableSettings\.material\.acrylic[\s\S]*?stableSettings\.material\.mica[\s\S]*?controller\.updateWindowMaterial/u);
  assert.match(settingsAppSource, /data-window-material=\{preferences\.windowMaterial\}/u);
  assert.match(materialContrastStyles, /\.cap-settings-window-foundation\[data-window-material="mica"\][\s\S]*?--stable-settings-card: #ffffff[\s\S]*?--cap-stable-navigation-state: #ffffff[\s\S]*?--cap-stable-search-surface: #ffffff[\s\S]*?theme-dark[\s\S]*?rgb\(38 38 38 \/ 97%\)/u);
  assert.match(materialContrastStyles, /data-window-material="mica"[\s\S]*?cap-stable-settings-shortcut-groups \.cap-stable-settings-section-cards[\s\S]*?box-shadow: none;[\s\S]*?cap-stable-settings-shortcut-groups \.cap-stable-settings-card[\s\S]*?box-shadow: inset 0 0 0 1px var\(--cap-stable-material-border\);/u);
  assert.match(materialContrastStyles, /cap-settings-window-foundation:not\(\.theme-dark\)\[data-window-material="mica"\] \.cap-settings-skim-format-group\s*\{\s*background: #ffffff;/u);
  assert.match(materialContrastStyles, /cap-settings-window-foundation\.theme-dark\[data-window-material="mica"\][\s\S]*?--cap-stable-search-surface: var\(--cap-stable-navigation-state\)/u);
  assert.match(materialContrastStyles, /cap-settings-window-foundation:not\(\.theme-dark\)\[data-window-material="acrylic"\][\s\S]*?--cap-stable-navigation-state: rgb\(255 255 255 \/ 68%\)[\s\S]*?--cap-stable-search-surface: rgb\(255 255 255 \/ 68%\)[\s\S]*?cap-settings-window-foundation\.theme-dark\[data-window-material="acrylic"\][\s\S]*?--cap-stable-navigation-state: rgb\(0 0 0 \/ 42%\)[\s\S]*?--cap-stable-search-surface: rgb\(0 0 0 \/ 42%\)/u);
  assert.match(settingsAppSource, /<FontSizeSetting value=\{preferences\.uiFontSize\}[\s\S]*?controller\.updateUiFontSize/u);
  assert.match(fontSizeSettingSource, /type="range" min=\{12\} max=\{16\} step=\{1\}/u);
  assert.match(fontSizeSettingSource, /uiFontSize\.small[\s\S]*?uiFontSize\.standard[\s\S]*?uiFontSize\.large/u);
  assert.match(fontSizeSettingSource, /size === 12[\s\S]*?size === 13[\s\S]*?size === 16/u);
  assert.match(fontSizeSettingSource, /setDraftValue[\s\S]*?onPointerUp=\{commit\}[\s\S]*?onKeyUp=\{commit\}[\s\S]*?onBlur=\{commit\}/u);
  assert.doesNotMatch(fontSizeSettingSource, /px|uiFontSize\.12|uiFontSize\.13|uiFontSize\.14|uiFontSize\.15|uiFontSize\.16/u);
  assert.match(fontSizeSettingStyles, /justify-content: space-between[\s\S]*?padding: 0 9px/u);
  assert.match(fontSizeSettingStyles, /webkit-slider-thumb/u);
  assert.match(settingsAppSource, /useUiFontSize\(preferences\?\.uiFontSize \?\? defaultUiFontSize\)/u);
  assert.match(settingsAppSource, /category === "general"[\s\S]*?settings\.standbyLine[\s\S]*?category === "appearance"/u);
  assert.doesNotMatch(settingsAppSource, /stableSettings\.windowMode|switchWindowPresentationMode|WindowPresentationModeSettingsRow/u);
  assert.doesNotMatch(settingsAppSource, /settings\.rememberWindowLayout|stableSettings\.desc\.rememberWindows/u);
  assert.match(settingsAppSource, /category === "browse"[\s\S]*?<SkimDisplaySettingsRows stableUi/u);
  assert.match(settingsAppSource, /id: "browse", label: "settings\.skimDisplay"/u);
  assert.doesNotMatch(settingsAppSource, /beginAddDirectory|controller\.directories|stableSettings\.section\.folders/u);
  assert.match(settingsAppSource, /--stable-settings-theme-color[\s\S]*?appearanceColors\.themeColor/u);
  assert.match(settingsAppSource, /--stable-settings-focus[\s\S]*?appearanceColors\.accentColor/u);
  assert.match(settingsAppSource, /aria-current=\{activeCategory === category\.id \? "page" : undefined\}/u);
  assert.match(settingsAppSource, /<SettingsConfirmationDialog[\s\S]*?message=\{dialog\.message\}/u);
  assert.match(settingsAppSource, /useSettingsConfirmation\(\)[\s\S]*?onCancel=\{cancelDialog\}[\s\S]*?confirmDialog\(\)/u);
  assert.match(settingsAppSource, /useInertElement<HTMLDivElement>\(dialog !== null\)[\s\S]*?ref=\{settingsShellRef\}/u);
  assert.doesNotMatch(settingsAppSource, /dragRegionRef/u);
  assert.doesNotMatch(settingsAppSource, /clearHiddenConfirmation|setDialogBusy|pendingDialog/u);
  assert.match(settingsConfirmationControllerSource, /document\.visibilityState === "hidden"[\s\S]*?setDialog\(null\)[\s\S]*?addEventListener\("visibilitychange", clearHiddenConfirmation\)/u);
  assert.match(settingsConfirmationControllerSource, /if \(dialogBusy\) return;[\s\S]*?const pendingDialog = dialog;[\s\S]*?currentDialog === pendingDialog \? null : currentDialog/u);
  assert.match(settingsStyles, /\.cap-settings-window-drag-region \{[\s\S]*?app-region: drag;[\s\S]*?-webkit-app-region: drag;/u);
  assert.match(settingsConfirmationSource, /<DialogShell label=\{message\} stable>[\s\S]*?cap-dialog-warning-icon[\s\S]*?cap-dialog-actions/u);
  assert.match(dialogShellSource, /role="alertdialog"[\s\S]*?aria-label=\{label\}/u);
  assert.match(settingsAccessibilityStyles, /cap-settings-window-foundation button:focus-visible[\s\S]*?var\(--stable-settings-focus\)/u);
  assert.match(settingsAccessibilityStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition-duration: 0ms !important/u);
  assert.match(settingsAccessibilityStyles, /cap-stable-settings-copy p[\s\S]*?overflow-wrap: anywhere/u);
  assert.match(settingsStyles, /cap-stable-settings-shell[\s\S]*?grid-template-columns: 176px minmax\(0, 1fr\)/u);
  assert.doesNotMatch(settingsStyles, /\.cap-stable-settings-navigation\s*\{[^}]*?(?:background|backdrop-filter):/u);
  assert.match(settingsStyles, /cap-stable-settings-search[\s\S]*?height: 34px[\s\S]*?border-radius: var\(--radius-pill\)/u);
  assert.match(settingsStyles, /cap-stable-settings-search[\s\S]*?background: var\(--cap-stable-search-surface\)/u);
  assert.match(settingsStyles, /\.cap-stable-settings-search input::placeholder \{ color: var\(--cap-stable-search-placeholder\); opacity: 1; \}/u);
  assert.match(navigationStateStyles, /--cap-stable-search-placeholder: rgb\(31 31 31 \/ 54%\);[\s\S]*?theme-dark[\s\S]*?--cap-stable-search-placeholder: rgb\(244 244 244 \/ 48%\);/u);
  assert.doesNotMatch(settingsAccessibilityStyles, /cap-stable-settings-search:focus-within/u);
  assert.match(settingsAppSource, /filterQuery[\s\S]*?searchCompositionRef[\s\S]*?onCompositionStart[\s\S]*?onCompositionEnd[\s\S]*?setFilterQuery/u);
  assert.match(settingsAppSource, /<StableUiIcon name="search" className="cap-stable-settings-search-icon" \/>/u);
  assert.match(settingsStyles, /cap-stable-settings-search-icon \{ width: 16px; height: 16px; color: var\(--stable-settings-secondary\); \}/u);
  assert.match(settingsStyles, /cap-stable-settings-section-cards\s*\{[\s\S]*?gap: 0;[\s\S]*?border-radius: 22px;[\s\S]*?background: var\(--stable-settings-card\)/u);
  assert.match(settingsStyles, /cap-stable-settings-shortcut-groups \.cap-stable-settings-section-cards\s*\{[\s\S]*?gap: 16px;[\s\S]*?background: transparent;[\s\S]*?cap-stable-settings-shortcut-groups \.cap-stable-settings-card\s*\{[\s\S]*?border-radius: 22px;[\s\S]*?background: var\(--stable-settings-card\);/u);
  assert.match(settingsStyles, /cap-stable-settings-section > h2\s*\{[\s\S]*?margin: 0 0 8px;/u);
  assert.match(settingsAppSource, /cap-stable-settings-content-track[\s\S]*?shownCategories\.map/u);
  assert.match(settingsAppSource, /SettingsCategoryIcon[\s\S]*?icon: "general"[\s\S]*?icon: "about"[\s\S]*?<SettingsCategoryIcon name=\{category\.icon\} \/>/u);
  assert.doesNotMatch(settingsAppSource, /data-short|short: "(?:⚙|◐|▣|AI|◫|⌨|!|\?)"/u);
  assert.match(settingsCategoryIconSource, /viewBox="0 0 24 24"[\s\S]*?name === "general"[\s\S]*?name === "about"/u);
  assert.match(settingsStyles, /cap-stable-settings-category-icon[\s\S]*?width: 16px[\s\S]*?height: 16px[\s\S]*?@media \(max-width: 700px\)[\s\S]*?width: 17px[\s\S]*?height: 17px/u);
  assert.match(settingsStyles, /cap-stable-settings-content-track\s*\{[\s\S]*?width: min\(100%, 1000px\)[\s\S]*?margin-inline: auto[\s\S]*?cap-stable-settings-panel\s*\{[\s\S]*?width: 100%[\s\S]*?cap-stable-settings-section,[\s\S]*?cap-stable-settings-section-cards[\s\S]*?width: 100%/u);
  assert.match(settingsStyles, /cap-stable-settings-content-frame\.cap-scroll-viewport-frame-vertical[\s\S]*?grid-template-columns: minmax\(0, 1fr\)[\s\S]*?cap-stable-settings-content-frame > \.cap-custom-scrollbar-vertical[\s\S]*?position: absolute[\s\S]*?right: 0/u);
  assert.match(settingsStyles, /cap-settings-window-foundation[\s\S]*?--scrollbar-thumb: color-mix\(in srgb, var\(--stable-settings-text\) 42%, transparent\)[\s\S]*?--scrollbar-thumb-hover: color-mix\(in srgb, var\(--stable-settings-text\) 62%, transparent\)/u);
  assert.match(customScrollbarStyles, /grid-template-columns: minmax\(0, 1fr\) var\(--custom-scrollbar-hit-size, 8px\)[\s\S]*?width: var\(--custom-scrollbar-thumb-size, 4px\)/u);
  assert.match(settingsStyles, /cap-stable-settings-card\s*\{[\s\S]*?min-height: 62px;[\s\S]*?background: transparent/u);
  assert.match(settingsStyles, /cap-stable-settings-card \+ \.cap-stable-settings-card \{ border-top: 1px solid var\(--stable-settings-border\); \}/u);
  assert.match(settingsStyles, /cap-stable-settings-card-expanded[\s\S]*?align-items: stretch[\s\S]*?@media \(max-width: 700px\)[\s\S]*?grid-template-columns: 52px minmax\(0, 1fr\)/u);
  assert.match(settingsStyles, /@media \(max-width: 700px\)[\s\S]*?cap-stable-settings-card[\s\S]*?grid-template-columns: minmax\(0, 1fr\)[\s\S]*?cap-stable-settings-colors[\s\S]*?justify-content: flex-start/u);
  assert.match(stableSelectStyles, /@media \(max-width: 700px\)[\s\S]*?cap-stable-settings-model-line[\s\S]*?width: 100%[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto auto[\s\S]*?cap-stable-settings-select[\s\S]*?max-width: none/u);
  assert.match(stableRuntimeDiagnosticStyles, /@media \(max-width: 700px\)[\s\S]*?cap-stable-runtime-diagnostics-row[\s\S]*?grid-template-columns: 116px minmax\(0, 1fr\) auto/u);
  assert.match(stableSkimStyles, /cap-settings-skim-display-stable[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)[\s\S]*?cap-settings-skim-extension\[data-selected="true"\]/u);
  assert.match(stableSkimStyles, /cap-settings-skim-extension\s*\{[\s\S]*?min-height: 24px[\s\S]*?height: 24px[\s\S]*?border-radius: var\(--radius-pill\)/u);
  assert.match(skimDisplaySource, /stableUi[\s\S]*?cap-settings-skim-category-control[\s\S]*?role="switch"[\s\S]*?settings\.hiddenFiles/u);
  assert.match(settingsAppSource, /<EmbeddedMetadataSettingsRow stableUi \/>/u);
  assert.doesNotMatch(settingsAppSource, /SettingCard title="settings\.embeddedMetadata"[^>]*cap-stable-settings-card-expanded/u);
  const embeddedMetadataSource = fs.readFileSync(path.join(root, "src", "renderer", "settings", "EmbeddedMetadataSettingsRow.tsx"), "utf8");
  assert.match(embeddedMetadataSource, /className=\{stableUi \? "cap-stable-settings-button" : "cap-settings-pill"\}/u);
  assert.match(embeddedMetadataSource, /if \(stableUi\)[\s\S]*?cap-stable-settings-action-line/u);
  assert.match(embeddedMetadataSettingsSource, /isRequestPending[\s\S]*?settings\.embeddedMetadataChecking[\s\S]*?settings\.embeddedMetadataRequestFailed/u);
  assert.match(embeddedMetadataSettingsSource, /await api\.startBackfill\(\)[\s\S]*?catch \{[\s\S]*?setRequestError\(true\)/u);
  assert.match(mainSource, /configureEmbeddedMetadataRuntime\([\s\S]*?settingsWindowController\?\.getWebContents\(\)/u);
  assert.match(mainSource, /setThumbnailOptimizationStatusListener\([\s\S]*?settingsWindowController\?\.send\("cache:optimizationStatusChanged", status\)/u);
  assert.match(mainSource, /isVisibleAndFocused\(mainWindow\)[\s\S]*?settingsWindowController\?\.isVisibleAndFocused\(\)[\s\S]*?isVisibleAndFocused\(previewWindow\)/u);
  assert.match(embeddedMetadataRuntimeSource, /getActiveWebContents[\s\S]*?includes\(event\.sender\)[\s\S]*?for \(const webContents of getActiveWebContents\(\)\)/u);
  assert.match(mainSource, /registerAppUpdateIpc\([\s\S]*?isSenderAllowed: \(event\) => isMainSenderAllowed\(event\) \|\| isSettingsSenderAllowed\(event\)[\s\S]*?service: appUpdateDownloadService/u);
  assert.match(appUpdateIpcSource, /app:checkForUpdates[\s\S]*?app:downloadUpdate[\s\S]*?app:pauseUpdateDownload[\s\S]*?app:discardUpdate[\s\S]*?app:installUpdate/u);
  assert.match(appUpdateIpcSource, /if \(!isSenderAllowed\(event\)\)[\s\S]*?service\.setAvailableAsset\(result\.asset\)/u);
  assert.match(mainSource, /onProgress:[\s\S]*?settingsWindowController\?\.send\("app:updateDownloadProgress"/u);
  assert.match(settingsUpdateControlSource, /\(result\.receivedBytes \?\? 0\) > 0[\s\S]*?setStatus\("resumable"\)/u);
  assert.match(settingsUpdateControlSource, /result\?\.reason === "invalid" \? "download_failed" : "install_failed"/u);
  assert.match(settingsUpdatePresentationSource, /status === "install_failed"[\s\S]*?settings\.updateInstallerOpenFailed/u);
  assert.match(mainSource, /registerDiagnosticsIpc\([\s\S]*?isSettingsSenderAllowed\(event\)[\s\S]*?BrowserWindow\.fromWebContents\(event\.sender\)/u);
  assert.match(stableSkimStyles, /cap-settings-skim-extension\[data-selected="true"\][\s\S]*?linear-gradient[\s\S]*?cap-settings-skim-extension:hover:not\(:disabled\)[\s\S]*?background: var\(--stable-settings-card\)/u);
  assert.match(settingsControllerSource, /preferences\.onChanged[\s\S]*?directories\.onChanged/u);
  assert.match(settingsControllerSource, /refreshAllPromiseRef[\s\S]*?if \(refreshAllPromiseRef\.current\) return refreshAllPromiseRef\.current/u);
  assert.match(settingsControllerSource, /if \(showLoading\) \{[\s\S]*?setIsLoading\(true\)[\s\S]*?if \(showLoading\) setIsLoading\(false\)/u);
  assert.match(settingsControllerSource, /refreshAll\(true\)[\s\S]*?const refreshOnFocus = \(\) => \{ void refreshAll\(false\); \};[\s\S]*?addEventListener\("focus", refreshOnFocus\)/u);
  assert.match(preloadSource, /settingsWindow:[\s\S]*?settingsWindow:open/u);
  assert.match(preloadSource, /directories:[\s\S]*?directories:changed[\s\S]*?preferences:[\s\S]*?preferences:changed/u);
  assert.match(appSource, /onOpenSettings:\s*\(\) => void window\.cap7ce\?\.settingsWindow\.open\(\)/u);
  assert.match(appSource, /useSettingsDataSynchronization/u);
  assert.match(mainSource, /const openSettings = async \(\) => Boolean\(await settingsWindowController\?\.open\(\)\)/u);
  assert.match(mainSource, /preview:openSettings[\s\S]*?return openSettings\(\)/u);
  assert.doesNotMatch(mainSource, /openLegacySettings|isIndependentSettingsWindowEnabled/u);
  assert.match(preferenceIpcSource, /updateAndBroadcast[\s\S]*?broadcastPreferencesChanged/u);
  assert.match(directoryIpcSource, /decorateAndBroadcast[\s\S]*?broadcastDirectoriesChanged/u);
  assert.doesNotMatch(settingsAppSource, /SettingsView|ipcRenderer|localStorage|stable-ui-canvas|[A-Z]:\\/u);
  assert.match(architectureSource, /settingsWindowController\.ts[\s\S]*?版本化专属 bounds/u);
  assert.match(featureDocSource, /U7 内容与状态边界/u);
  assert.match(featureDocSource, /亚克力[\s\S]*?云母[\s\S]*?安全纯色/u);

  await fs.promises.rm(temporaryRoot, { recursive: true, force: true });
  console.log(JSON.stringify({ singleInstanceVerified: true, independentBoundsVerified: true, rendererEntryVerified: true, senderGuardVerified: true, sharedStateBroadcastVerified: true, formalSettingsContentVerified: true, shellVisualLayoutVerified: true, retiredFallbackAbsent: true }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
