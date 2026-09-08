const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createSystemNotificationService } = require("../dist-electron/systemNotificationService.js");

const root = path.resolve(__dirname, "..");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const createHarness = ({
  platform = "win32",
  isPackaged = true,
  supported = true,
  throwOnShow = false,
  throwOnActivationRegistration = false
} = {}) => {
  const diagnostics = [];
  const notifications = [];
  let activationHandler = null;
  let activationCount = 0;

  const service = createSystemNotificationService({
    platform,
    isPackaged,
    iconPath: "C:\\Cap7CE\\notification-icon.png",
    isSupported: () => supported,
    createNotification: (options) => {
      const listeners = new Map();
      const notification = {
        options,
        once(event, listener) {
          listeners.set(event, listener);
          return this;
        },
        show() {
          if (throwOnShow) throw new Error("native toast failed");
        },
        emit(event, ...args) {
          listeners.get(event)?.(...args);
        }
      };
      notifications.push(notification);
      return notification;
    },
    registerActivationHandler: (handler) => {
      if (throwOnActivationRegistration) throw new Error("activation registration failed");
      activationHandler = handler;
    },
    onActivated: () => {
      activationCount += 1;
    },
    diagnostics: { log: (level, event, data = {}) => diagnostics.push({ level, event, data }) }
  });

  return {
    service,
    diagnostics,
    notifications,
    activate: () => activationHandler?.(),
    getActivationCount: () => activationCount,
    hasActivationHandler: () => activationHandler !== null
  };
};

const disabled = createHarness();
assert.equal(disabled.service.show({ title: "title", body: "private body", enabled: false }), false);
assert.equal(disabled.notifications.length, 0);
assert.deepEqual(disabled.diagnostics, []);

const forced = createHarness();
assert.equal(forced.service.show({ title: "title", body: "body", enabled: false, force: true }), true);
assert.equal(forced.notifications.length, 1);

const unsupported = createHarness({ supported: false });
assert.equal(unsupported.service.show({ title: "title", body: "body", enabled: true }), false);
assert.deepEqual(unsupported.diagnostics, [{ level: "warn", event: "system_notification.unsupported", data: { packaged: true } }]);

const development = createHarness({ isPackaged: false });
development.service.initialize();
assert.equal(development.hasActivationHandler(), false);
assert.equal(development.service.show({ title: "title", body: "body", enabled: true }), false);
assert.deepEqual(development.diagnostics, [{ level: "warn", event: "system_notification.development_skipped", data: { packaged: false } }]);

const nonWindows = createHarness({ platform: "linux" });
assert.equal(nonWindows.service.show({ title: "title", body: "body", enabled: true }), false);
assert.equal(nonWindows.notifications.length, 0);

const activationFailure = createHarness({ throwOnActivationRegistration: true });
activationFailure.service.initialize();
assert.equal(activationFailure.hasActivationHandler(), false);
assert.equal(activationFailure.diagnostics[0].event, "system_notification.activation_registration_failed");
assert.equal(activationFailure.diagnostics[0].data.packaged, true);

const shown = createHarness();
assert.equal(shown.hasActivationHandler(), false);
shown.service.initialize();
shown.service.initialize();
assert.equal(shown.hasActivationHandler(), true);
assert.equal(shown.service.show({ title: "Cache complete", body: "Processed local files", enabled: true }), true);
assert.deepEqual(shown.notifications[0].options, {
  title: "Cache complete",
  body: "Processed local files",
  silent: true,
  icon: "C:\\Cap7CE\\notification-icon.png"
});
shown.notifications[0].emit("show");
shown.activate();
assert.equal(shown.getActivationCount(), 1);
assert.deepEqual(shown.diagnostics, [{ level: "info", event: "system_notification.shown", data: { packaged: true } }]);

shown.notifications[0].emit("failed", {}, "toast registration rejected");
assert.deepEqual(shown.diagnostics.at(-1), {
  level: "error",
  event: "system_notification.failed",
  data: { packaged: true, error: "toast registration rejected" }
});
assert.ok(shown.diagnostics.every((entry) => !JSON.stringify(entry).includes("Processed local files")));

const failed = createHarness({ throwOnShow: true });
assert.equal(failed.service.show({ title: "title", body: "private body", enabled: true }), false);
assert.equal(failed.diagnostics.at(-1).event, "system_notification.failed");
assert.ok(!JSON.stringify(failed.diagnostics).includes("private body"));

assert.equal(packageJson.build.appId, "Cap7CE");
assert.match(mainSource, /const windowsAppUserModelId = "Cap7CE"/u);
assert.match(mainSource, /registerActivationHandler: \(handler\) => Notification\.handleActivation\(handler\)/u);
assert.match(mainSource, /settingsWindowController = new SettingsWindowController[\s\S]*systemNotificationService\.initialize\(\)/u);
assert.match(mainSource, /createNotification: \(options\) => new Notification\(options\)/u);
assert.match(mainSource, /onInstallerOpened: \(version\) => appUpdateInstallIntentStore\.record\(version\)/u);
assert.match(mainSource, /notification\.updateCompletedTitle[\s\S]*notification\.updateCompletedContent[\s\S]*force: true[\s\S]*appUpdateInstallIntentStore\.clear\(version\)/u);
assert.doesNotMatch(mainSource, /displayBalloon|balloon-click/u);

console.log(JSON.stringify({
  packagedWindowsToastOnly: true,
  disabledAndUnsupportedStatesGuarded: true,
  silentNotificationOptionsVerified: true,
  notificationActivationOpensSettings: true,
  diagnosticContentRedactionVerified: true,
  installerUpdateCompletionNotificationWired: true,
  trayBalloonFallbackRemoved: true,
  appUserModelIdMatchesInstaller: true
}));
