const assert = require('node:assert/strict'), fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { createMetadataBuildRuntime } = require('../dist-electron/metadataExtraction/metadataBuildRuntime.js');
const { createMetadataBuildPreferenceStore } = require('../dist-electron/metadataBuildPreferences.js');
const { registerMetadataBuildIpc } = require('../dist-electron/metadataExtraction/metadataBuildIpc.js');
const { createSettingsMetadataBuildRequest } = require('../dist-electron/settingsMetadataBuildRequest.js');
const id = 'A'.repeat(32), policy = { volumeOrder: [id], includes: [{ volumeId: id, rootFileReference: null }], excludes: [] };
const catalog = { volumes: [{ volumeId: id, displayName: 'X:', selected: true, queryable: true }] };
(async () => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap7ce-config-only-'));
 try {
  const store = createMetadataBuildPreferenceStore(path.join(root, 'metadata-build.json'));
  let configured = 0, workers = 0, changes = 0;
  const protocol = { async execute() { workers++; throw Error('Unexpected content read'); }, async configure() { configured++; }, async pause() {}, async startChanges() { changes++; },
   async discover() { return { state: 1, discovered: 0, nextCursor: null }; }, async lease() { return { state: 1, ticket: null }; },
   async status() { return { state: 'active', ledger: { pendingJobs: 0, leasedJobs: 0, unavailableVolumeIds: [] } }; } };
  const create = () => createMetadataBuildRuntime(protocol, async () => catalog, { preferences: store, yieldMs: 0 });
  const runtime = create();
  const saved = await runtime.savePolicy(policy);
  assert.equal(saved.progress.phase, 'idle'); assert.deepEqual(saved.policy, policy);
  assert.equal((await store.load()).consent, false); assert.equal((await store.load()).intent, 'configured');
  await runtime.notifyCatalogChange(); await runtime.restore(); await runtime.pause();
  assert.equal((await store.load()).consent, false, 'pause must not promote a configuration into a grant');
  assert.equal(configured, 0); assert.equal(workers, 0); assert.equal(changes, 0);
  const restarted = create(); await restarted.restore(); await restarted.notifyCatalogChange();
  assert.deepEqual((await restarted.status()).policy, policy); assert.equal(configured, 0, 'save and restart cannot activate extraction');
  await assert.rejects(restarted.resume(), /not-paused/);
  await assert.rejects(restarted.savePolicy({ ...policy, volumeOrder: ['B'.repeat(32)] }));
  assert.deepEqual((await store.load()).policy, policy);
  const handlers = new Map(), signals = [];
  registerMetadataBuildIpc({ handle: (key, fn) => handlers.set(key, fn), on() {} }, event => event.main || event.settings, restarted,
    { isDirectorySenderAllowed: event => event.main, onChanged: () => signals.push('changed') });
  await assert.rejects(handlers.get('metadataBuild:savePolicy')({}, policy), /not allowed/);
  await assert.rejects(handlers.get('metadataBuild:savePolicy')({ settings: true }, { ...policy, volumeOrder: [] }));
  await assert.rejects(handlers.get('metadataBuild:savePolicy')({ settings: true }, { ...policy, volumeOrder: [id, id] }));
  await handlers.get('metadataBuild:savePolicy')({ settings: true }, policy);
  await assert.rejects(handlers.get('metadataBuild:startDirectory')({ settings: true }, { path: 'X:\\Assets', allowMetadataExtraction: true }), /not allowed/);
  assert.equal(configured, 0); assert.ok(signals.length);
  let releaseSave;
  const blocking = createMetadataBuildRuntime(protocol, async () => catalog, { preferences: { load: async () => null, save: () => new Promise(resolve => { releaseSave = resolve; }) } });
  const locks = new Map(); registerMetadataBuildIpc({ handle: (key, fn) => locks.set(key, fn), on() {} }, () => true, blocking);
  const pending = locks.get('metadataBuild:savePolicy')({}, policy);
  for (let i = 0; i < 100 && !releaseSave; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof releaseSave, 'function');
  await assert.rejects(locks.get('metadataBuild:start')({}, { allowMetadataExtraction: true, policy }), /busy/);
  releaseSave(); await pending; assert.equal(configured, 0);
  const failed = createMetadataBuildRuntime(protocol, async () => catalog, { preferences: { load: async () => null, save: async () => { throw Error('disk-full'); } } });
  await assert.rejects(failed.savePolicy(policy), /disk-full/); assert.equal((await failed.status()).policy, null);
  let releaseOpen, notified = 0;
  const navigation = createSettingsMetadataBuildRequest(() => new Promise(resolve => { releaseOpen = resolve; }), () => notified++);
  const opening = navigation.request(); assert.equal(navigation.consume(), true, 'first-load navigation can be consumed before opening finishes');
  releaseOpen(true); assert.equal(await opening, true); assert.equal(notified, 1); assert.equal(navigation.consume(), false);
  const rejected = createSettingsMetadataBuildRequest(async () => false); assert.equal(await rejected.request(), false); assert.equal(rejected.consume(), false);
  await handlers.get('metadataBuild:start')({ settings: true }, { allowMetadataExtraction: true, policy });
  for (let i = 0; i < 100 && (await restarted.status()).progress.phase !== 'completed'; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(configured > 0, 'only the explicit start grants extraction'); assert.equal((await store.load()).consent, true);
  await restarted.shutdown(); await runtime.shutdown(); await blocking.shutdown(); await assert.rejects(failed.shutdown(), /disk-full/);
  console.log('Metadata configuration-only persistence, restart, consent, sender isolation, mutation serialization and navigation mailbox passed.');
 } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
