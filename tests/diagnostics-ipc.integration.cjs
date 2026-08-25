const assert = require("node:assert/strict");
const { registerDiagnosticsIpc } = require("../dist-electron/diagnosticsIpc.js");

const handlers = new Map();
let detailed = false;
const diagnostics = {
  logDirectory: "C:\\runtime\\logs",
  crashDirectory: "C:\\runtime\\Crashpad",
  runtimeLogPath: "C:\\runtime\\logs\\cap7ce-runtime.jsonl",
  getInfo: () => ({
    logDirectory: diagnostics.logDirectory,
    crashDirectory: diagnostics.crashDirectory,
    runtimeLogPath: diagnostics.runtimeLogPath,
    detailedLoggingEnabled: detailed
  }),
  setDetailedLoggingEnabled: (enabled) => {
    detailed = enabled;
    return diagnostics.getInfo();
  },
  startOperation: () => ({ complete: () => undefined, fail: () => undefined }),
  flush: async () => undefined
};

registerDiagnosticsIpc({
  registrar: {
    handle: (channel, listener) => handlers.set(channel, listener),
    on: () => undefined
  },
  isSenderAllowed: (event) => event.allowed === true,
  diagnostics,
  appVersion: "0.0.0-test",
  documentsPath: "C:\\Documents",
  additionalLogPaths: [],
  chooseExportPath: async () => null
});

assert.deepEqual([...handlers.keys()], [
  "diagnostics:getInfo",
  "diagnostics:setDetailedLogging",
  "diagnostics:export"
]);

const run = async () => {
  await assert.rejects(() => handlers.get("diagnostics:getInfo")({ allowed: false }), /not allowed/);
  assert.equal((await handlers.get("diagnostics:getInfo")({ allowed: true })).detailedLoggingEnabled, false);
  assert.equal((await handlers.get("diagnostics:setDetailedLogging")({ allowed: true }, true)).detailedLoggingEnabled, true);
  await assert.rejects(() => handlers.get("diagnostics:setDetailedLogging")({ allowed: true }, "yes"), /Invalid/);
  assert.deepEqual(await handlers.get("diagnostics:export")({ allowed: true }), { status: "cancelled" });
  console.log(JSON.stringify({ diagnosticsIpc: "ok", channels: handlers.size }));
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
