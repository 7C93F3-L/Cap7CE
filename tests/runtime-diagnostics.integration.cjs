const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { unzipSync, strFromU8 } = require("fflate");
const { RuntimeDiagnostics } = require("../dist-electron/runtimeDiagnostics.js");
const { exportRuntimeDiagnosticBundle } = require("../dist-electron/runtimeDiagnosticBundle.js");

const run = async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "cap7ce-runtime-diagnostics-"));
  try {
    const logDirectory = path.join(root, "logs");
    await fsp.mkdir(logDirectory, { recursive: true });
    await fsp.writeFile(path.join(logDirectory, ".active-session.json"), JSON.stringify({ sessionId: "stale-session" }));

    const diagnostics = new RuntimeDiagnostics({ userDataPath: root, maxLogBytes: 700, retainedLogFiles: 2 });
    await diagnostics.initialize();
    diagnostics.log("error", "test.failure", { error: new Error("Failed at C:\\Users\\Alice\\Secret\\image.png") });
    diagnostics.logDetailed("test.detail", { value: "hidden until enabled" });
    diagnostics.setDetailedLoggingEnabled(true);
    diagnostics.logDetailed("test.detail", { value: "visible" });
    await diagnostics.flush();

    const initialLogs = [
      await fsp.readFile(diagnostics.runtimeLogPath, "utf8"),
      await fsp.readFile(`${diagnostics.runtimeLogPath}.1`, "utf8").catch(() => "")
    ].join("\n");
    assert.match(initialLogs, /session\.unclean_exit/);
    assert.match(initialLogs, /test\.failure/);
    assert.match(initialLogs, /<local-path>/);
    assert.doesNotMatch(initialLogs, /Alice|Secret|image\.png/);
    assert.equal((initialLogs.match(/test\.detail/g) || []).length, 1);

    for (let index = 0; index < 20; index += 1) {
      diagnostics.log("info", "test.rotation", { index, padding: "x".repeat(100) });
    }
    await diagnostics.flush();
    assert.equal(fs.existsSync(`${diagnostics.runtimeLogPath}.1`), true);
    assert.equal(fs.existsSync(`${diagnostics.runtimeLogPath}.3`), false);

    const appUpdateLog = path.join(logDirectory, "app-update.log");
    await fsp.writeFile(appUpdateLog, "source C:\\Users\\Alice\\Downloads\\update.zip\n", "utf8");
    const crashPath = path.join(diagnostics.crashDirectory, "completed", "sample.dmp");
    await fsp.mkdir(path.dirname(crashPath), { recursive: true });
    await fsp.writeFile(crashPath, Buffer.from([1, 2, 3, 4]));
    const bundlePath = path.join(root, "diagnostics.zip");
    await fsp.writeFile(bundlePath, "existing export", "utf8");
    await exportRuntimeDiagnosticBundle({
      diagnostics,
      destinationPath: bundlePath,
      appVersion: "0.0.0-test",
      additionalLogPaths: [appUpdateLog]
    });
    const archive = unzipSync(new Uint8Array(await fsp.readFile(bundlePath)));
    assert.ok(archive["diagnostics-summary.json"]);
    assert.ok(Object.keys(archive).some((name) => name.startsWith("logs/") && name.includes("app-update")));
    assert.ok(Object.keys(archive).some((name) => name.startsWith("crashes/") && name.endsWith("sample.dmp")));
    const exportedText = Object.entries(archive)
      .filter(([name]) => /\.(?:json|jsonl|log|txt)$/.test(name))
      .map(([, bytes]) => strFromU8(bytes))
      .join("\n");
    assert.doesNotMatch(exportedText, /Alice|Downloads|update\.zip/);
    assert.match(exportedText, /<local-path>/);

    diagnostics.markCleanExitSync();
    assert.equal(fs.existsSync(diagnostics.activeSessionPath), false);
    console.log(JSON.stringify({ runtimeDiagnostics: "ok", archiveFiles: Object.keys(archive).length }));
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
