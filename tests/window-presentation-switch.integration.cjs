const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createWindowPresentationSwitchRuntime } = require("../dist-electron/windowPresentationSwitchRuntime.js");

const waitForTimers = () => new Promise((resolve) => setTimeout(resolve, 180));

const createHarness = async (overrides = {}) => {
  const root = overrides.root ?? await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-window-mode-switch-"));
  const handles = new Map();
  const calls = [];
  let activeMode = overrides.activeMode ?? "cap7ce";
  const runtime = createWindowPresentationSwitchRuntime({
    registrar: {
      handle: (channel, listener) => handles.set(channel, listener),
      on: () => undefined
    },
    isSenderAllowed: (event) => event.sender.id === 1,
    markerPath: path.join(root, "window-presentation-switch.json"),
    getActiveMode: () => activeMode,
    updatePreference: overrides.updatePreference ?? (async (mode) => {
      calls.push(["preference", mode]);
      return { windowPresentationMode: mode };
    }),
    flushBeforeRestart: overrides.flushBeforeRestart ?? (async () => { calls.push(["flush"]); }),
    relaunch: overrides.relaunch ?? (() => calls.push(["relaunch"])),
    setQuitting: () => calls.push(["setQuitting"]),
    quit: () => calls.push(["quit"]),
    startupTimeoutMs: overrides.startupTimeoutMs ?? 40,
    now: () => new Date("2026-08-30T08:00:00.000Z")
  });
  return { root, handles, calls, runtime, setActiveMode: (mode) => { activeMode = mode; } };
};

const run = async () => {
  const first = await createHarness();
  assert.deepEqual([...first.handles.keys()], ["app:quit", "app:switchWindowPresentationMode"]);
  await assert.rejects(first.handles.get("app:switchWindowPresentationMode")({ sender: { id: 2 } }, "compatibility"), /sender is not allowed/);
  await assert.rejects(first.handles.get("app:switchWindowPresentationMode")({ sender: { id: 1 } }, "invalid"), /Invalid window presentation mode/);
  assert.deepEqual(await first.handles.get("app:switchWindowPresentationMode")({ sender: { id: 1 } }, "compatibility"), {
    status: "restarting",
    targetMode: "compatibility"
  });
  assert.deepEqual(await first.handles.get("app:switchWindowPresentationMode")({ sender: { id: 1 } }, "compatibility"), {
    status: "busy",
    targetMode: "compatibility"
  });
  await waitForTimers();
  assert.deepEqual(first.calls, [["preference", "compatibility"], ["flush"], ["relaunch"], ["setQuitting"], ["quit"]]);

  const successfulProducer = await createHarness();
  await successfulProducer.runtime.requestSwitch("compatibility");
  const launching = await createHarness({ root: successfulProducer.root, activeMode: "compatibility", startupTimeoutMs: 500 });
  assert.equal(await launching.runtime.resolveStartupMode("compatibility"), "compatibility");
  await launching.runtime.completeStartup("compatibility");
  assert.deepEqual(launching.calls, []);

  const failedFlush = await createHarness({
    flushBeforeRestart: async () => { throw new Error("flush failed"); }
  });
  const originalWarn = console.warn;
  let failedFlushResult;
  try {
    console.warn = () => undefined;
    failedFlushResult = await failedFlush.runtime.requestSwitch("compatibility");
  } finally {
    console.warn = originalWarn;
  }
  assert.deepEqual(failedFlushResult, {
    status: "failed",
    targetMode: "compatibility"
  });
  assert.deepEqual(failedFlush.calls, [["preference", "compatibility"], ["preference", "cap7ce"]]);

  const timeoutProducer = await createHarness();
  await timeoutProducer.runtime.requestSwitch("compatibility");
  const timeout = await createHarness({ root: timeoutProducer.root, activeMode: "compatibility" });
  assert.equal(await timeout.runtime.resolveStartupMode("compatibility"), "compatibility");
  await waitForTimers();
  assert.deepEqual(timeout.calls, [["preference", "cap7ce"], ["relaunch"], ["setQuitting"], ["quit"]]);

  const staleLaunch = await createHarness({ activeMode: "cap7ce" });
  await fs.writeFile(path.join(staleLaunch.root, "window-presentation-switch.json"), JSON.stringify({
    version: 1,
    previousMode: "compatibility",
    targetMode: "cap7ce",
    phase: "launching",
    updatedAt: "2026-08-30T08:00:00.000Z"
  }));
  const staleRuntime = createWindowPresentationSwitchRuntime({
    registrar: { handle: () => undefined, on: () => undefined },
    isSenderAllowed: () => true,
    markerPath: path.join(staleLaunch.root, "window-presentation-switch.json"),
    getActiveMode: () => "cap7ce",
    updatePreference: async (mode) => {
      staleLaunch.calls.push(["stalePreference", mode]);
      return { windowPresentationMode: mode };
    },
    flushBeforeRestart: async () => undefined,
    relaunch: () => undefined,
    setQuitting: () => undefined,
    quit: () => undefined,
    startupTimeoutMs: 500
  });
  assert.equal(await staleRuntime.resolveStartupMode("cap7ce"), "compatibility");
  assert.deepEqual(staleLaunch.calls.at(-1), ["stalePreference", "compatibility"]);

  const [appearanceSource, rowSource, preloadSource, zhSource, enSource] = await Promise.all([
    fs.readFile(path.join(__dirname, "../src/renderer/settings/AppearanceSettingsSections.tsx"), "utf8"),
    fs.readFile(path.join(__dirname, "../src/renderer/settings/WindowPresentationModeSettingsRow.tsx"), "utf8"),
    fs.readFile(path.join(__dirname, "../electron/preload.ts"), "utf8"),
    fs.readFile(path.join(__dirname, "../electron/localization.ts"), "utf8"),
    fs.readFile(path.join(__dirname, "../electron/locales/en-US.ts"), "utf8")
  ]);
  assert.match(appearanceSource, /settings\.launchAtLogin[\s\S]*?<WindowPresentationModeSettingsRow activeMode=\{windowPresentationMode\}/);
  assert.match(rowSource, /activeMode === "cap7ce" \? "compatibility" : "cap7ce"/);
  assert.match(rowSource, /disabled=\{status === "switching"\}/);
  assert.match(preloadSource, /app:switchWindowPresentationMode/);
  for (const key of ["settings.compatibilityMode", "settings.cap7ceMode", "settings.switchWindowMode", "settings.switchingWindowMode", "settings.switchToCompatibilityHint", "settings.switchToCap7CEHint", "settings.windowModeSwitchFailed"]) {
    assert.ok(zhSource.includes(`"${key}"`), `Missing Chinese text: ${key}`);
    assert.ok(enSource.includes(`"${key}"`), `Missing English text: ${key}`);
  }

  await Promise.all([first, successfulProducer, failedFlush, timeoutProducer, staleLaunch].map(({ root }) => fs.rm(root, { recursive: true, force: true })));
  console.log(JSON.stringify({
    senderValidationVerified: true,
    duplicateSwitchSuppressed: true,
    flushFailureRolledBack: true,
    startupTimeoutRolledBack: true,
    staleLaunchRolledBack: true,
    settingsTargetModeRowVerified: true
  }));
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
