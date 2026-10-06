const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createMetadataBuildPreferenceStore } = require("../dist-electron/metadataBuildPreferences.js");
const { createMetadataBuildRuntime } = require("../dist-electron/metadataExtraction/metadataBuildRuntime.js");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-metadata-preferences-"));
  const file = path.join(root, "settings", "metadata-build.json");
  try {
    const store = createMetadataBuildPreferenceStore(file);
    assert.equal(await store.load(), null);
    const volumeId = "A".repeat(32), folder = "1".repeat(16);
    const policy = { volumeOrder: [volumeId], includes: [{ volumeId, rootFileReference: folder }], excludes: [] };
    const saved = { version: 2, consent: true, intent: "active", policy, scopeLabels: { [`${volumeId}:${folder}`]: "X:\\Assets" } };
    await store.save(saved); assert.deepEqual(await store.load(), saved);
    await assert.rejects(store.save({ ...saved, consent: false }));
    assert.deepEqual(await store.load(), saved, "failed validation preserves previous scope");
    let configured = 0;
    const protocol = { async configure() { configured++; }, async pause() {}, async consumeChanges() { return { hasMore: false }; }, async discover() { return { jobs: [], next: null }; },
      async claim() { return { state: 1 }; }, async status() { return { state: "active", ledger: { pendingJobs: 0, leasedJobs: 0, unavailableVolumeIds: [] } }; } };
    const catalog = { volumes: [{ volumeId, displayName: "X:", selected: true }] };
    const restored = createMetadataBuildRuntime(protocol, async () => catalog, { preferences: store, yieldMs: 0,
      workerFactory: () => ({ close() {} }) });
    const initial = await restored.status();
    assert.deepEqual(initial.policy, policy); assert.deepEqual(initial.scopeLabels, saved.scopeLabels);
    assert.equal(initial.progress.phase, "idle"); assert.equal(configured, 0, "saved consent cannot implicitly read content");
    await assert.rejects(restored.resume());
    await restored.start({ allowMetadataExtraction: true, policy });
    for (let i = 0; i < 100 && (await restored.status()).progress.phase !== "completed"; i++) await new Promise(r => setTimeout(r, 5));
    await restored.notifyCatalogChange(); await restored.shutdown();
    assert.equal((await restored.status()).progress.phase, "completed"); const completedConfigurations = configured;
    const offline = createMetadataBuildRuntime(protocol, async () => ({ volumes: [] }), { preferences: store });
    await assert.rejects(offline.start({ allowMetadataExtraction: true, policy })); assert.equal(configured, completedConfigurations);
    const denied = createMetadataBuildRuntime(protocol, async () => catalog, { preferences: { load: async () => null, save: async () => { throw Error("denied"); } } });
    await assert.rejects(denied.start({ allowMetadataExtraction: true, policy })); assert.equal(configured, completedConfigurations, "save failure must precede extraction");
    await fs.writeFile(file, "{broken"); assert.equal(await store.load(), null);
    await fs.writeFile(file, JSON.stringify({ ...saved, consent: false })); assert.equal(await store.load(), null);
    await fs.writeFile(file, " ".repeat(1024 * 1024 + 1)); assert.equal(await store.load(), null);
    assert.deepEqual(await fs.readdir(path.dirname(file)), [path.basename(file)], "no staging files are left behind");
    console.log("Metadata preferences persist scope and intention, reject malformed grants and never activate extraction from status alone.");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
