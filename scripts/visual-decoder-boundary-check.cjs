const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto'), { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '..'), directory = 'core/node/visualRendering/decoders/';
const paths = require('../core/node/visualRendering/decoders/legacy-paths.json');
const baseline = require('../core/node/visualRendering/decoders/source-baseline.json');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
assert.deepEqual(fs.readdirSync(path.join(root, directory)).filter(file => file.endsWith('.ts')).sort(), Object.keys(baseline).sort());
for (const [file, expected] of Object.entries(baseline)) {
  const source = read(directory + file);
  const normalized = source.replace(/((?:from|import)\s*|(?:require|import)\(\s*)(["'])(\.[^"']+)\2/g, '$1$2<module>$2').replace(/\r\n/g, '\n');
  assert.equal(createHash('sha256').update(normalized).digest('hex'), expected.sourceHash, `${file}: decoder behavior changed`);
  assert(source.trimEnd().split(/\r?\n/).length <= expected.lines, `${file}: source limit exceeded`);
  assert(!/writeVisualCacheEntry|createVisualCacheEntry|visualCacheEpoch|BrowserWindow|ipcRenderer|ipcMain|sqlite|node:(?:net|https?)/i.test(source), `${file}: decode-only boundary`);
}
const result = buildSync({ absWorkingDir: root, entryPoints: Object.keys(baseline).map(file => directory + file), outdir: 'unused',
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, metafile: true, logLevel: 'error' });
for (const file of Object.keys(result.metafile.inputs)) {
  const source = file.replaceAll('\\', '/');
  assert(source.startsWith(directory) || source === 'core/node/resourceCatalog/domain/formats/formatCapabilities.ts', `Decoder acquired a legacy/foreign implementation: ${file}`);
}
for (const [old, target] of Object.entries(paths)) {
  let relative = path.relative(path.dirname(path.join(root, old)), path.join(root, 'core/artifacts/file-facts', target)).replaceAll('\\', '/').replace(/\.ts$/, '');
  if (!relative.startsWith('.')) relative = './' + relative;
  assert.equal(read(old).replace(/\/\/[^\r\n]*/g, '').trim(), `export * from "${relative}";`, `${old}: compatibility entry only`);
}
assert(read('scripts/metadata-worker-build.cjs').includes('["core/node/visualRendering/decoders/psdArtboardRenderWorker.ts", "psdArtboardRenderWorker.js"'), 'Native runtime bundles canonical PSD thread');
assert(require('../package.json').build.asarUnpack.includes('core/artifacts/file-facts/**/*.js'), 'Legacy decoder thread and adjacent dependencies stay outside ASAR');
assert(require('../core/node/fileFacts/domain/tsconfig.json').include.includes('../../visualRendering/decoders/**/*.ts'), 'Shared compiler must emit decoder outputs');
console.log('Visual decoder boundaries passed: seven unchanged modules, independent closure, legacy forwarding and PSD thread packaging.');
