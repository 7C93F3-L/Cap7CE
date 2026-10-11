const assert = require('node:assert/strict');
const { authorizeComputerSearchPreviewData } = require('../dist-electron/computerSearchPreviewAuthorization.js');
const { handleComputerSearchVisualRequest } = require('../dist-electron/computerSearchVisualProtocol.js');
const { fileFormatCapabilities } = require('../dist-electron/formatCapabilities.js');
const authorization = { kind: 'computer-search', taskId: 'preview-owner', authorizationId: 'A'.repeat(32) };
let item, revoked = false;
const calls = [];
const runtime = { resolveAuthorizedItem: r => !revoked && r.taskId === authorization.taskId && r.authorizationId === authorization.authorizationId ? item : null,
  getVisualSessionId: () => 'preview-session', thumbnailLeases: { session: () => null, failed: () => { throw Error('preview must not mutate viewport failures'); } } };
const dependencies = { runtime,
  requestVisualCache: async (session, path, kind) => { calls.push({ session, kind }); return 'generated-cache'; },
  requestShellThumbnailCache: async session => { calls.push({ session, kind: 'shell-thumbnail' }); return 'generated-cache'; },
  requestShellPreviewCache: async session => { calls.push({ session, kind: 'shell-preview' }); return 'generated-cache'; },
  shouldUseSourceFileForPreview: async () => true,
  fetchSourceFile: async () => { calls.push({ kind: 'source' }); return new Response('local-image', { headers: { 'Content-Type': 'image/png' } }); },
  readVisualCacheImage: async () => ({ buffer: Buffer.from('generated-image'), mimeType: 'image/png' }) };
const data = provider => ({ sourceAuthorization: authorization, provider, filePath: 'client-path', info: { path: 'client-path' } });
(async () => {
  let images = 0;
  for (const capability of fileFormatCapabilities) {
    item = { ...capability, path: `X:\\Synthetic\\asset${capability.extension}`, name: `asset${capability.extension}`, authorizationId: authorization.authorizationId, isDirectory: false };
    const authorized = authorizeComputerSearchPreviewData(data(capability.previewKind), runtime);
    assert.equal(authorized.filePath, item.path); assert.equal(authorized.provider, capability.previewKind);
    if (capability.previewKind === 'image') {
      images++;
      assert.equal(new URL(authorized.thumbnailUrl).hostname, 'computer-search-preview-thumbnail');
      calls.length = 0;
      assert.equal((await handleComputerSearchVisualRequest(new URL(authorized.previewUrl), dependencies)).status, 200);
      assert.equal(calls.at(-1).kind, capability.canDirectPreview ? 'source' : capability.canShellPreview ? 'shell-preview' : 'preview');
      calls.length = 0;
      assert.equal((await handleComputerSearchVisualRequest(new URL(authorized.thumbnailUrl), dependencies)).status, 200);
      assert.equal(calls[0].session, 'preview-session', 'fallback is owned by demand preview, never an offscreen viewport lease');
      assert.equal(calls[0].kind, capability.canThumbnail ? 'thumbnail' : 'shell-thumbnail');
    } else if (['audio', 'video'].includes(capability.previewKind)) {
      assert.equal(new URL(authorized.previewUrl).hostname, 'skim-media'); assert.equal(authorized.thumbnailUrl, '');
    } else assert.equal(authorized.previewUrl, '');
  }
  item = { path: 'X:\\Synthetic\\image.gif', isDirectory: false, canDirectPreview: true, canThumbnail: true };
  const authorized = authorizeComputerSearchPreviewData(data('image'), runtime);
  calls.length = 0;
  assert.equal((await handleComputerSearchVisualRequest(new URL(authorized.previewUrl), { ...dependencies,
    requestVisualCache: async () => { throw Error('animation must not require static extraction'); } })).status, 200);
  assert.deepEqual(calls.map(x => x.kind), ['source']);
  assert.equal((await handleComputerSearchVisualRequest(new URL(authorized.previewUrl), { ...dependencies,
    fetchSourceFile: async () => { throw Error('local read failed'); } })).status, 404, 'source read rejection is caught');
  assert.equal((await handleComputerSearchVisualRequest(new URL(authorized.thumbnailUrl), dependencies)).status, 200);
  revoked = true;
  assert.equal(authorizeComputerSearchPreviewData(data('image'), runtime), null);
  assert.equal((await handleComputerSearchVisualRequest(new URL(authorized.thumbnailUrl), dependencies)).status, 403);
  revoked = false;
  assert.equal((await handleComputerSearchVisualRequest(new URL(authorized.thumbnailUrl), { ...dependencies,
    requestVisualCache: async () => { revoked = true; return 'generated-cache'; } })).status, 403);
  revoked = false; item.isDirectory = true;
  assert.equal((await handleComputerSearchVisualRequest(new URL(authorized.previewUrl), dependencies)).status, 403);
  console.log(JSON.stringify({ previewRouting: 'ok', formats: fileFormatCapabilities.length, images,
    independentFallback: true, animationWithoutStaticCache: true, sourceFailuresCaught: true, authorizationRechecked: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
