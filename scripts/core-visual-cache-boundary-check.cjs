const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), read = file => fs.readFileSync(path.join(root, file), 'utf8');
const directory = 'core/node/visualCache';
const limits = { 'store.ts': 420, 'publication.ts': 32, 'dispatch.ts': 75, 'host.ts': 50 };
assert.deepEqual(fs.readdirSync(path.join(root, directory)).filter(name => name.endsWith('.ts')).sort(), Object.keys(limits).sort());
for (const [file, limit] of Object.entries(limits)) {
  const source = read(`${directory}/${file}`);
  assert.ok(source.split(/\r?\n/).length <= limit, `${file} domain size`);
  assert.doesNotMatch(source, /from ["'](?:electron|node:(?:net|http|https|child_process))["']|Sqlite|sqlite|Reader\.Host|setInterval\(/, `${file} cache-only ownership`);
}
const store = read(`${directory}/store.ts`);
for (const anchor of ['createVisualCachePublications()', 'publicationOwner', 'createHmac("sha256", secret)', 'verifyEntry(entry)', 'maximumConcurrentCacheStatReads = 2', 'metadataPath']) assert.ok(store.includes(anchor), anchor);
const adapter = read('electron/visualCacheService.ts');
assert.ok(adapter.split(/\r?\n/).length <= 50); assert.doesNotMatch(adapter, /node:(?:fs|crypto)|publishVisualCache|fs\.|\.stat\(/);
assert.doesNotMatch(read('electron/thumbnailService.ts'), /node:fs|fs\.readdir/);
const client = read('electron/core/coreVisualCacheClient.ts');
for (const anchor of [require('../third_party/node-runtime/manifest.json').sha256, 'NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE', 'shell: false', 'windowsHide: true']) assert.ok(client.includes(anchor), anchor);
const builder = read('scripts/metadata-worker-build.cjs');
assert.ok(builder.indexOf('assertStopped(output)') < builder.indexOf('await fs.rm(output'));
assert.ok(builder.includes('core/node/visualCache/host.ts'));
console.log('Independent Core cache domain, authenticated publication and thin Shell boundaries passed.');
