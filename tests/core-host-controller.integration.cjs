const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  CoreHostController
} = require("../dist-electron/core/coreHostController.js");
const {
  CoreProtocolClient
} = require("../dist-electron/core/coreProtocolClient.js");
const {
  createCoreHostLaunchProfile
} = require("../dist-electron/core/coreHostLaunchProfile.js");

const root = path.resolve(__dirname, "..");
const executablePath = path.join(
  root, "core", "artifacts", "bin", "Cap7CE.Core.Host", "Release",
  "net10.0-windows", "Cap7CE.Core.Host.exe"
);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const waitUntil = async (read, predicate, timeoutMs = 10_000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = read();
    if (predicate(value)) return value;
    await delay(25);
  }
  throw new Error("Timed out waiting for Core controller state.");
};

const readLine = (stream, timeoutMs = 10_000) => new Promise((resolve, reject) => {
  let buffered = Buffer.alloc(0);
  const finish = (error, value) => {
    clearTimeout(timer);
    stream.off("data", onData);
    stream.off("end", onEnd);
    error ? reject(error) : resolve(value);
  };
  const onData = (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    const newline = buffered.indexOf(10);
    if (newline >= 0) finish(undefined, buffered.subarray(0, newline).toString("utf8"));
  };
  const onEnd = () => finish(new Error("Core host ended before ready."));
  const timer = setTimeout(() => finish(new Error("Core host ready timeout.")), timeoutMs);
  stream.on("data", onData);
  stream.once("end", onEnd);
});

const waitForExit = async (child, timeoutMs = 5_000) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const timeout = delay(timeoutMs).then(() => false);
  if (await Promise.race([exited.then(() => true), timeout])) return;
  child.kill();
  await exited;
};

const startSyntheticClient = async () => {
  const pipeName = `cap7ce-core-p11-${randomBytes(16).toString("hex")}`;
  const sessionSecret = randomBytes(32).toString("base64");
  const child = spawn(executablePath, ["--synthetic-server", "--pipe-name", pipeName], {
    cwd: path.dirname(executablePath),
    windowsHide: true,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"]
  });
  child.stderr.resume();
  child.stdin.end(`${sessionSecret}\n`, "utf8");
  const ready = JSON.parse(await readLine(child.stdout));
  assert.equal(ready.status, "ready");
  assert.equal(ready.processId, child.pid);
  const client = await CoreProtocolClient.connect({
    pipeName,
    sessionSecret,
    expectedServerProcessId: child.pid,
    expectedSyntheticFixture: true,
    requiredCapabilities: ["session.hello", "search.start", "search.nextPage", "search.cancel"],
    clientProductVersion: "1.0.4"
  });
  return { child, client };
};

const verifyProtocolDeadlinesAndCancellation = async () => {
  const { child, client } = await startSyntheticClient();
  try {
    assert.throws(
      () => client.startRequest("search.start", { padding: "x".repeat(1024 * 1024) }),
      (error) => error?.code === "message-too-large"
    );
    await assert.rejects(
      client.request("search.start", {
        query: "slow-fixture",
        pageSize: 20,
        sort: "name-ascending",
        volumeIds: ["synthetic-volume"]
      }, 1),
      (error) => error?.code === "deadline-exceeded" && error?.retryable === true
    );

    const pending = client.startRequest("search.start", {
      query: "slow-fixture",
      pageSize: 20,
      sort: "name-ascending",
      volumeIds: ["synthetic-volume"]
    }, 5_000);
    const cancellationResult = pending.response.then(
      () => null,
      (error) => error
    );
    await delay(25);
    assert.equal(await client.cancel(pending.requestId), true);
    assert.equal((await cancellationResult)?.code, "cancelled");
  } finally {
    client.close();
    await waitForExit(child);
  }
};

const verifyStructuredUnavailableStates = async () => {
  const packaged = new CoreHostController({
    packaged: true,
    productVersion: "1.0.4"
  });
  assert.deepEqual(await packaged.start(), {
    state: "unavailable",
    reason: "packaged-core-not-installed",
    processId: undefined,
    protocolVersion: undefined,
    serverProductVersion: undefined,
    restartCount: 0
  });

  const missing = new CoreHostController({
    packaged: false,
    executablePath: path.join(root, "core", "missing", "Cap7CE.Core.Host.exe"),
    productVersion: "1.0.4"
  });
  assert.equal((await missing.start()).reason, "core-host-missing");
};

const verifyLaunchProfiles = async () => {
  const product = createCoreHostLaunchProfile("product", "a".repeat(32));
  assert.equal(product.pipeName, `cap7ce-core-p35-${"a".repeat(32)}`);
  assert.deepEqual(product.arguments, ["--catalog-server", "--pipe-name", product.pipeName]);
  await product.cleanup();

  const probe = createCoreHostLaunchProfile("probe", "b".repeat(32));
  assert.equal(probe.pipeName, `cap7ce-core-p32-${"b".repeat(32)}`);
  assert.deepEqual(probe.arguments, ["--catalog-controller-probe", "--pipe-name", probe.pipeName]);
  await probe.cleanup();
};

const verifyGracefulLifecycle = async () => {
  const events = [];
  const controller = new CoreHostController({
    packaged: false,
    executablePath,
    productVersion: "1.0.4",
    diagnostics: { log: (level, event, data = {}) => events.push({ level, event, data }) }
  });
  const [ready, concurrentReady, repeatedReady] = await Promise.all([
    controller.start(),
    controller.start(),
    controller.start()
  ]);
  assert.equal(ready.state, "ready");
  assert.equal(concurrentReady.processId, ready.processId);
  assert.equal(repeatedReady.processId, ready.processId);
  assert.equal(events.filter((entry) => entry.event === "core.controller.starting").length, 1);
  assert.equal(ready.protocolVersion, 1);
  assert.equal(ready.serverProductVersion, "1.0.4");
  assert.ok(Number.isInteger(ready.processId));
  const capability = await controller.readCapabilityStatus();
  assert.deepEqual({
    state: capability.state,
    catalogSchemaVersion: capability.catalogSchemaVersion,
    electronConnected: capability.electronConnected,
    readsFileContent: capability.readsFileContent,
    writesSourceVolumes: capability.writesSourceVolumes,
    usesNetwork: capability.usesNetwork
  }, {
    state: "available",
    catalogSchemaVersion: 2,
    electronConnected: false,
    readsFileContent: false,
    writesSourceVolumes: false,
    usesNetwork: false
  });
  assert.equal((await controller.stop()).state, "stopped");
  const diagnosticText = JSON.stringify(events);
  assert.doesNotMatch(diagnosticText, /Cap7CE\.Core\.Host\.exe|cap7ce-core-p32-|catalog\.db/i);
};

const verifySingleCrashRecovery = async () => {
  const events = [];
  const controller = new CoreHostController({
    packaged: false,
    executablePath,
    productVersion: "1.0.4",
    diagnostics: { log: (level, event, data = {}) => events.push({ level, event, data }) }
  });
  try {
    const first = await controller.start();
    assert.equal(first.state, "ready");
    process.kill(first.processId);
    const recovered = await waitUntil(
      () => controller.snapshot(),
      (snapshot) => snapshot.state === "ready" && snapshot.restartCount === 1
    );
    assert.notEqual(recovered.processId, first.processId);
    process.kill(recovered.processId);
    const exhausted = await waitUntil(
      () => controller.snapshot(),
      (snapshot) => snapshot.state === "failed"
    );
    assert.equal(exhausted.reason, "core-crash-restart-exhausted");
    assert.equal(events.filter((entry) => entry.event === "core.controller.restarting").length, 1);
  } finally {
    await controller.stop();
  }
};

const verifyCrashDuringApplicationStop = async () => {
  const events = [];
  const controller = new CoreHostController({
    packaged: false,
    executablePath,
    productVersion: "1.0.4",
    diagnostics: { log: (level, event, data = {}) => events.push({ level, event, data }) }
  });
  const ready = await controller.start();
  assert.equal(ready.state, "ready");
  process.kill(ready.processId);
  assert.equal((await controller.stop()).state, "stopped");
  await delay(100);
  assert.equal(controller.snapshot().state, "stopped");
  assert.equal(events.filter((entry) => entry.event === "core.controller.restarting").length, 0);
};

const run = async () => {
  assert.equal(process.platform, "win32", "Core controller integration is Windows-only.");
  assert.equal(fs.existsSync(executablePath), true, "Build Core before running the controller integration test.");
  await verifyLaunchProfiles();
  await verifyStructuredUnavailableStates();
  await verifyProtocolDeadlinesAndCancellation();
  await verifyGracefulLifecycle();
  await verifySingleCrashRecovery();
  await verifyCrashDuringApplicationStop();
  console.log(JSON.stringify({
    coreHostController: "ok",
    rendererIpc: false,
    packagedCore: false,
    automaticRestarts: 1,
    crashDuringApplicationStop: "stopped"
  }));
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
