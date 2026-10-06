const assert = require("node:assert/strict");
const { createMetadataBuildRuntime } = require("../dist-electron/metadataExtraction/metadataBuildRuntime.js");
const { registerMetadataBuildIpc } = require("../dist-electron/metadataExtraction/metadataBuildIpc.js");
const { createMetadataBuildBridge } = require("../dist-electron/metadataExtraction/metadataBuildBridge.js");
const volumeId = "A".repeat(32);
const policy = { volumeOrder: [volumeId], includes: [{ volumeId, rootFileReference: null }], excludes: [] };
const catalog = { volumes: [{ volumeId, displayName: "X:", selected: true }], tasks: [], catalogRevision: 1 };
(async () => {
  let configured = 0, pauses = 0, workers = 0;
  const protocol = {
    async configure() { configured++; }, async pause() { pauses++; },
    async discover() { return { jobs: [], next: null }; }, async consumeChanges() { return { hasMore: false }; }, async claim() { return { state: 1, ticket: null }; },
    async status() { return { state: "active", ledger: { pendingJobs: 0, leasedJobs: 0, unavailableVolumeIds: [] } }; }
  };
  const runtime = createMetadataBuildRuntime(protocol, async () => catalog, {
    yieldMs: 0, resolveScope: async () => ({ resolved: true, queryable: true, volumeId, rootFileReference: "1".repeat(16) }),
    workerFactory() { workers++; return { extract() { throw Error("unexpected-content-read"); }, close() {} }; }
  });
  const initial = await runtime.status(); assert.equal(initial.progress.phase, "idle");
  assert.equal(configured, 0); assert.equal(workers, 0, "reading status never activates content extraction");
  await assert.rejects(runtime.start({ allowMetadataExtraction: false, policy }));
  await assert.rejects(runtime.start({ allowMetadataExtraction: true, policy: { ...policy, volumeOrder: ["B".repeat(32)] } }));
  assert.equal(configured, 0, "unselected volumes and absent consent cannot reach configuration");
  const handlers = new Map();
  registerMetadataBuildIpc({ handle(channel, fn) { handlers.set(channel, fn); }, on() {} }, (event) => event.allowed, runtime);
  for (const fn of handlers.values()) await assert.rejects(fn({ allowed: false }, { allowMetadataExtraction: true, policy }));
  await assert.rejects(handlers.get("metadataBuild:start")({ allowed: true }, { allowMetadataExtraction: true, policy: { ...policy, includes: [{ volumeId, rootFileReference: "not-an-identity" }] } }));
  assert.equal(configured, 0, "IPC rejects invalid scope identities before starting");
  await assert.rejects(handlers.get("metadataBuild:resolveScope")({ allowed: true }, "\\\\server\\folder"));
  const directory = await handlers.get("metadataBuild:resolveScope")({ allowed: true }, "X:\\Library");
  assert.equal(directory.volumeId, volumeId); assert.equal(directory.rootFileReference, "1".repeat(16));
  assert.equal(configured, 0, "scope resolution does not authorize content extraction");
  const calls = [];
  const bridge = createMetadataBuildBridge({ invoke(channel, request) { calls.push(channel); return handlers.get(channel)({ allowed: true }, request); } });
  await bridge.start({ allowMetadataExtraction: true, policy });
  for (let i = 0; i < 50 && (await bridge.status()).progress.phase !== "completed"; i++) await new Promise((resolve) => setTimeout(resolve, 5));
  await runtime.notifyCatalogChange();
  const done = await bridge.status(); assert.equal(done.progress.phase, "completed"); const completedConfigurations = configured;
  assert.ok(configured >= 2, "initial completion drains durable hints without another full sweep");
  done.policy.volumeOrder.length = 0; assert.equal((await runtime.status()).policy.volumeOrder.length, 1, "snapshots do not expose mutable task policy");
  await bridge.pause(); assert.equal((await runtime.status()).progress.phase, "paused"); assert.equal(pauses, 1);
  await runtime.notifyCatalogChange(); assert.equal(configured, completedConfigurations, "paused completed grants cannot extract on notifications");
  assert.ok(calls.includes("metadataBuild:start"));
  let release;
  const waiting = createMetadataBuildRuntime(protocol, () => new Promise((resolve) => { release = resolve; }));
  const start = waiting.start({ allowMetadataExtraction: true, policy });
  await waiting.pause(); release(catalog); await assert.rejects(start, /start-cancelled/);
  assert.equal(configured, completedConfigurations, "pause cancels an in-flight catalog preparation before any extractor is started");
  let stalled = false, releaseCatalog;
  const pausedRuntime = createMetadataBuildRuntime({ ...protocol, async status() {
    return { state: "active", ledger: { pendingJobs: 0, leasedJobs: 0, unavailableVolumeIds: [volumeId] } };
  } }, () => stalled ? new Promise(resolve => { releaseCatalog = resolve; }) : Promise.resolve(catalog), {
    yieldMs: 0, workerFactory: () => ({ close() {} })
  });
  await pausedRuntime.start({ allowMetadataExtraction: true, policy }); await pausedRuntime.pause();
  assert.equal((await pausedRuntime.status()).progress.phase, "paused");
  stalled = true; const preparingStart = pausedRuntime.start({ allowMetadataExtraction: true, policy });
  await assert.rejects(pausedRuntime.resume(), /busy/, "resume cannot bypass a pending scope preparation");
  for (let i = 0; i < 100 && !releaseCatalog; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof releaseCatalog, "function");
  releaseCatalog(catalog); await preparingStart; await pausedRuntime.pause();
  console.log("Metadata build IPC consent, sender isolation, shared bridge and lifecycle tests passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
