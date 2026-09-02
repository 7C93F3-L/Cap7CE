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
const settingsControllerSource = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "useSettingsWindowController.ts"), "utf8");
const settingsStyles = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "SettingsWindowApp.css"), "utf8");
const settingsAccessibilityStyles = fs.readFileSync(path.join(root, "src", "renderer", "settings-window", "SettingsWindowAccessibility.css"), "utf8");
const preferenceIpcSource = fs.readFileSync(path.join(root, "electron", "preferenceIpc.ts"), "utf8");
const directoryIpcSource = fs.readFileSync(path.join(root, "electron", "directoryManagementIpc.ts"), "utf8");
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
  isMaximized() { return this.maximized; }
  restore() { this.minimized = false; this.calls.push("restore"); }
  show() { this.visible = true; this.calls.push("show"); }
  focus() { this.calls.push("focus"); }
  hide() { this.visible = false; this.calls.push("hide"); }
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
    rendererPath: "index.html",
    presentationMode: () => "compatibility"
  });
  assert.equal(await controller.open(), true);
  assert.equal(created.length, 1);
  created[0].emit("ready-to-show");
  created[0].minimized = true;
  assert.equal(await controller.open(), true);
  assert.equal(created.length, 1);
  assert.deepEqual(created[0].calls.slice(-3), ["restore", "show", "focus"]);
  assert.equal(controller.send("preferences:changed", { themePreference: "dark" }), true);
  assert.deepEqual(created[0].sent.at(-1), ["preferences:changed", { themePreference: "dark" }]);
  const closeEvent = { prevented: false, preventDefault() { this.prevented = true; } };
  created[0].emit("close", closeEvent);
  assert.equal(closeEvent.prevented, true);
  assert.equal(created[0].visible, false);
  assert.match(created[0].loaded, /window=settings/u);
  await controller.flush();

  const broadcasts = [];
  const broadcastSettingsData = createSettingsDataBroadcaster({
    sendToMain: (channel, value) => broadcasts.push(["main", channel, value]),
    sendToSettings: (channel, value) => broadcasts.push(["settings", channel, value])
  });
  const canonicalPreferences = { languagePreference: "zh-CN" };
  assert.equal(broadcastSettingsData("preferences:changed", canonicalPreferences), canonicalPreferences);
  assert.deepEqual(broadcasts, [["main", "preferences:changed", canonicalPreferences], ["settings", "preferences:changed", canonicalPreferences]]);

  assert.match(rendererEntrySource, /windowKind === "settings"[\s\S]*?import\("\.\/settings-window\/SettingsWindowApp"\)/u);
  assert.match(settingsAppSource, /categoryDefinitions[\s\S]*?"general"[\s\S]*?"appearance"[\s\S]*?"browse"[\s\S]*?"search-ai"[\s\S]*?"cache"[\s\S]*?"shortcuts"[\s\S]*?"diagnostics"[\s\S]*?"about"/u);
  assert.match(settingsAppSource, /useSettingsWindowController/u);
  assert.match(settingsAppSource, /SettingsWindowUpdateControl/u);
  assert.match(settingsAppSource, /stableSettings\.material\.readOnly/u);
  assert.match(settingsAppSource, /--stable-settings-theme-color[\s\S]*?appearanceColors\.themeColor/u);
  assert.match(settingsAppSource, /--stable-settings-focus[\s\S]*?appearanceColors\.accentColor/u);
  assert.match(settingsAppSource, /aria-current=\{activeCategory === category\.id \? "page" : undefined\}/u);
  assert.match(settingsAppSource, /role="alertdialog"[\s\S]*?aria-label=\{dialog\.message\}/u);
  assert.match(settingsAccessibilityStyles, /cap-settings-window-foundation button:focus-visible[\s\S]*?var\(--stable-settings-focus\)/u);
  assert.match(settingsAccessibilityStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition-duration: 0ms !important/u);
  assert.match(settingsAccessibilityStyles, /cap-stable-settings-copy p[\s\S]*?overflow-wrap: anywhere/u);
  assert.match(settingsControllerSource, /preferences\.onChanged[\s\S]*?directories\.onChanged/u);
  assert.match(preloadSource, /settingsWindow:[\s\S]*?settingsWindow:open/u);
  assert.match(preloadSource, /directories:[\s\S]*?directories:changed[\s\S]*?preferences:[\s\S]*?preferences:changed/u);
  assert.match(appSource, /onOpenSettings:\s*\(\) => void window\.cap7ce\?\.settingsWindow\.open\(\)/u);
  assert.match(appSource, /useSettingsDataSynchronization/u);
  assert.match(mainSource, /const openSettings = async[\s\S]*?settingsWindowController\?\.open\(\)[\s\S]*?openLegacySettings/u);
  assert.match(mainSource, /preview:openSettings[\s\S]*?isIndependentSettingsWindowEnabled[\s\S]*?closePreviewSession/u);
  assert.match(preferenceIpcSource, /updateAndBroadcast[\s\S]*?broadcastPreferencesChanged/u);
  assert.match(directoryIpcSource, /decorateAndBroadcast[\s\S]*?broadcastDirectoriesChanged/u);
  assert.doesNotMatch(settingsAppSource, /SettingsView|ipcRenderer|localStorage|stable-ui-canvas|[A-Z]:\\/u);
  assert.match(architectureSource, /settingsWindowController\.ts[\s\S]*?版本化专属 bounds/u);
  assert.match(featureDocSource, /U7 内容与状态边界/u);
  assert.match(featureDocSource, /Acrylic（目标，只读）/u);

  await fs.promises.rm(temporaryRoot, { recursive: true, force: true });
  console.log(JSON.stringify({ singleInstanceVerified: true, independentBoundsVerified: true, rendererEntryVerified: true, senderGuardVerified: true, sharedStateBroadcastVerified: true, formalSettingsContentVerified: true, legacyFallbackGuarded: true }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
