const assert = require('node:assert/strict');
const { ComputerSearchThumbnailLeases } = require('../dist-electron/computerSearchThumbnailLeases.js');
const { handleComputerSearchVisualRequest } = require('../dist-electron/computerSearchVisualProtocol.js');
const { registerComputerSearchThumbnailIpc } = require('../dist-electron/computerSearchThumbnailIpc.js');
const begun = [], cancelled = [], items = new Map();
const authorization = { taskId: 'query-one', authorizationId: 'A'.repeat(32) };
const item = { path: 'X:\\Synthetic\\poster.png', canThumbnail: true, isDirectory: false };
items.set(authorization.authorizationId, item);
const leases = new ComputerSearchThumbnailLeases(request => request.taskId === authorization.taskId ? items.get(request.authorizationId) ?? null : null,
  id => { begun.push(id); return true; }, id => { cancelled.push(id); return true; });
const runtime = { thumbnailLeases: leases, resolveAuthorizedItem: request => request.taskId === authorization.taskId ? items.get(request.authorizationId) ?? null : null,
  getVisualSessionId: () => 'persistent-preview-session' };
const cacheCalls = [], dependencies = { runtime,
  requestVisualCache: async (session, path, kind) => { cacheCalls.push({ session, path, kind }); return 'synthetic-cache'; },
  requestShellThumbnailCache: async session => { cacheCalls.push({ session, kind: 'shell' }); return 'synthetic-cache'; },
  requestShellPreviewCache: async () => 'synthetic-cache', shouldUseSourceFileForPreview: async () => false,
  fetchSourceFile: async () => { throw Error('source fetching forbidden in generated fixture'); },
  readVisualCacheImage: async () => ({ buffer: Buffer.from('generated'), mimeType: 'image/png' }) };
const url = (id, preview = false) => new URL(`cap7ce://computer-search-${preview ? 'preview' : 'thumbnail'}/?task=${authorization.taskId}&authorization=${authorization.authorizationId}&lease=${id ?? ''}`);
(async () => {
  assert.equal((await handleComputerSearchVisualRequest(url(null), dependencies)).status, 403);
  assert.equal(cacheCalls.length, 0, 'query authorization alone cannot enqueue thumbnails');
  const first = leases.acquire(authorization), second = leases.acquire(authorization);
  assert.notEqual(first, second, 'StrictMode late cleanup cannot cancel a newer owner');
  assert.equal(leases.session({ ...authorization, taskId: 'other-query' }, first), null);
  assert.equal(leases.session({ ...authorization, authorizationId: 'B'.repeat(32) }, first), null);
  assert.equal(leases.release('other-query', first), false);
  assert.equal(leases.release(authorization.taskId, first), true);
  assert.equal((await handleComputerSearchVisualRequest(url(first), dependencies)).status, 403);
  assert.ok(leases.session(authorization, second));
  assert.equal((await handleComputerSearchVisualRequest(url(second), dependencies)).status, 200);
  assert.notEqual(cacheCalls.at(-1).session, 'persistent-preview-session');
  let complete;
  const inFlight = handleComputerSearchVisualRequest(url(second), { ...dependencies,
    requestVisualCache: () => new Promise(resolve => { complete = resolve; }),
    readVisualCacheImage: async () => { throw Error('released visual must not read cached bytes'); } });
  leases.release(authorization.taskId, second); complete('cache');
  assert.equal((await inFlight).status, 403);
  assert.equal((await handleComputerSearchVisualRequest(url(null, true), dependencies)).status, 200,
    'viewport cancellation does not cancel demand preview');
  const all = Array.from({ length: 512 }, () => leases.acquire(authorization));
  assert.ok(all.every(Boolean)); assert.equal(leases.acquire(authorization), null);
  assert.ok(leases.session(authorization, all[0]), 'capacity cannot silently evict live interests');
  leases.releaseTask(authorization.taskId); assert.equal(cancelled.length, begun.length);
  const failing = leases.acquire(authorization);
  await handleComputerSearchVisualRequest(url(failing), { ...dependencies, requestVisualCache: async () => { throw Error('invalid fixture'); } });
  leases.release(authorization.taskId, failing); assert.equal(leases.acquire(authorization), null, 're-entering cannot repeatedly decode a failed source');
  leases.releaseTask(authorization.taskId);
  const shell = { ...authorization, authorizationId: 'B'.repeat(32) };
  items.set(shell.authorizationId, { ...item, canThumbnail: false });
  const timedOut = leases.acquire(shell); leases.failed(shell, timedOut, Object.assign(Error('timeout'), { code: 'ETIMEDOUT' }));
  const shellOther = { ...shell, authorizationId: 'C'.repeat(32) }; items.set(shellOther.authorizationId, { ...item, canThumbnail: false });
  assert.equal(leases.acquire(shellOther), null, 'shell circuit remains query-wide across short leases');
  const decoded = leases.acquire(authorization); assert.ok(decoded, 'shell circuit does not disable normal decoder');
  leases.release(authorization.taskId, decoded); leases.failed(authorization, decoded, Error('late-cancel'));
  assert.ok(leases.acquire(authorization), 'released work cannot poison a new interest');
  leases.releaseTask(authorization.taskId);
  const handlers = new Map(); registerComputerSearchThumbnailIpc({ registrar: { handle: (name, callback) => handlers.set(name, callback) },
    runtime, isSenderAllowed: event => event.allowed });
  await assert.rejects(handlers.get('computerSearch:acquireThumbnail')({ allowed: false }, authorization), /not allowed/);
  await assert.rejects(handlers.get('computerSearch:acquireThumbnail')({ allowed: true }, { ...authorization, path: item.path }), /invalid-authorization/);
  const allowed = await handlers.get('computerSearch:acquireThumbnail')({ allowed: true }, authorization);
  await assert.rejects(handlers.get('computerSearch:releaseThumbnail')({ allowed: true }, { taskId: authorization.taskId, leaseId: allowed, extra: true }), /invalid-thumbnail-lease/);
  assert.equal(await handlers.get('computerSearch:releaseThumbnail')({ allowed: true }, { taskId: authorization.taskId, leaseId: allowed }), true);
  items.clear(); assert.equal(leases.acquire(authorization), null);
  // Exercise the real queue owners with generated providers; no disk, codec or native shell I/O.
  const providerIds = ['visualCacheService', 'visualRenderService', 'shellThumbnailProvider'].map(name => require.resolve(`../dist-electron/${name}.js`));
  const saved = providerIds.map(id => require.cache[id]);
  const decodes = [], gates = [];
  const ensure = async (source, kind) => { decodes.push({ source, kind }); return new Promise(resolve => gates.push(() => resolve('generated-cache'))); };
  const mocks = [{ clearSkimVisualCaches: async () => ({}), getSkimVisualCacheStats: async () => ({}) },
    { ensureSkimThumbnailPath: source => ensure(source, 'thumbnail'), ensureSkimPreviewPath: source => ensure(source, 'preview') },
    { ensureSkimShellThumbnailPath: source => ensure(source, 'shell'), ensureSkimShellPreviewPath: source => ensure(source, 'shell-preview') }];
  providerIds.forEach((id, index) => { require.cache[id] = { id, filename: id, loaded: true, exports: mocks[index] }; });
  try {
    const queue = require('../dist-electron/skimVisualCacheService.js');
    items.set(authorization.authorizationId, item);
    const owned = new ComputerSearchThumbnailLeases(runtime.resolveAuthorizedItem, queue.beginSkimVisualSession, queue.cancelSkimVisualSession);
    const queueRuntime = { ...runtime, thumbnailLeases: owned }, reads = [];
    const options = { ...dependencies, runtime: queueRuntime, requestVisualCache: queue.requestSkimVisualCache,
      readVisualCacheImage: async path => { reads.push(path); return { buffer: Buffer.from('generated'), mimeType: 'image/png' }; } };
    const ids = Array.from({ length: 3 }, () => owned.acquire(authorization));
    const responses = ids.map(id => handleComputerSearchVisualRequest(url(id), options));
    assert.equal(decodes.length, 2, 'only two bounded decoders may be active');
    queue.beginSkimVisualSession('persistent-preview-session');
    const previewResponse = handleComputerSearchVisualRequest(url(null, true), options);
    for (const id of ids) owned.release(authorization.taskId, id);
    gates.splice(0).forEach(resolve => resolve());
    for (let attempt = 0; attempt < 20 && decodes.length < 3; attempt++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(decodes.length, 3); assert.equal(decodes[2].kind, 'preview', 'withdrawn queued thumbnail never decodes; preview survives');
    gates.splice(0).forEach(resolve => resolve());
    assert.deepEqual((await Promise.all(responses)).map(response => response.status), [404, 404, 404]);
    assert.equal((await previewResponse).status, 200); assert.equal(reads.length, 1);
    queue.cancelSkimVisualSession('persistent-preview-session');
    const { ShellThumbnailScheduler } = require('../dist-electron/shellThumbnailScheduler.js');
    const shellCalls = [], shellGates = [];
    const scheduler = new ShellThumbnailScheduler(async (path, kind) => { shellCalls.push({ path, kind }); return new Promise(resolve => shellGates.push(resolve)); });
    for (const session of ['visible-a', 'withdrawn-b', 'preview']) scheduler.beginSession(session);
    scheduler.setActive(true);
    const shellRequests = [scheduler.request('visible-a', 'X:\\generated-a'), scheduler.request('withdrawn-b', 'X:\\generated-b'), scheduler.request('preview', 'X:\\generated-preview', 'preview')];
    const shellSettled = Promise.allSettled(shellRequests);
    scheduler.cancelSession('withdrawn-b'); scheduler.cancelSession('visible-a'); scheduler.setActive(false);
    shellGates.shift()('generated-cache');
    for (let attempt = 0; attempt < 20 && shellCalls.length < 2; attempt++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(shellCalls.length, 2); assert.equal(shellCalls[1].kind, 'preview');
    shellGates.shift()('generated-preview-cache');
    assert.deepEqual((await shellSettled).map(result => result.status), ['rejected', 'rejected', 'fulfilled']);
    await scheduler.clear();
  } finally { providerIds.forEach((id, index) => { if (saved[index]) require.cache[id] = saved[index]; else delete require.cache[id]; }); }
  console.log('Viewport thumbnail leases: authorization, cancellation, capacity, preview separation and failure bounds passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
