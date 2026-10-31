const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '..'), domain = 'core/node/embeddedMetadata/domain/';
const paths = require('../core/node/embeddedMetadata/legacy-paths.json');
const baseline = require('../core/node/embeddedMetadata/source-baseline.json');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
assert.deepEqual(fs.readdirSync(path.join(root, domain)).filter(file => file.endsWith('.ts')).sort(), Object.keys(baseline).sort());
// Ignore relative module locations only; all parser statements and literal data
// must retain the migration baseline. Future behavior changes update this guard explicitly.
for (const [file, expected] of Object.entries(baseline)) {
  const source = fs.readFileSync(path.join(root, domain, file), 'utf8');
  const normalized = source.replace(/((?:from|import)\s*|require\(\s*)(["'])(\.[^"']+)\2/g, '$1$2<module>$2').replace(/\r\n/g, '\n');
  assert.equal(createHash('sha256').update(normalized).digest('hex'), expected.sourceHash, `${file}: parser behavior changed`);
  assert(source.trimEnd().split(/\r?\n/).length <= expected.lines, `${file}: source limit exceeded`);
}
const result = buildSync({ absWorkingDir: root, entryPoints: [domain + 'embeddedMetadataExtractor.ts'],
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, metafile: true, logLevel: 'error' });
for (const file of Object.keys(result.metafile.inputs))
  assert(file.replaceAll('\\', '/').startsWith(domain), `Embedded parser depends on a legacy implementation: ${file}`);
for (const [old, target] of Object.entries(paths)) {
  let relative = path.relative(path.dirname(path.join(root, old)), path.join(root, 'core/artifacts/embedded-metadata', target)).replaceAll('\\', '/').replace(/\.ts$/, '');
  if (!relative.startsWith('.')) relative = './' + relative;
  const source = fs.readFileSync(path.join(root, old), 'utf8').replace(/\/\/[^\r\n]*/g, '').trim();
  assert.equal(source, `export * from "${relative}";`, `${old}: compatibility entry only`);
}
for (const file of ['core/node/interactiveMetadata/worker.ts', 'core/node/storedMetadata/reader.ts'])
  assert(!/electron\/(?:embeddedMetadata|fileSourceRevision)/.test(fs.readFileSync(path.join(root, file), 'utf8')), `${file}: bypasses canonical metadata owner`);
const configuration = require('../package.json');
for (const task of ['build:electron', 'build:legacy'])
  assert(configuration.scripts[task].includes('npm run build:embedded-domain &&'), `${task}: compile compatibility outputs first`);
assert(configuration.build.files.includes('core/artifacts/embedded-metadata/**/*.js'), 'Legacy package must include compatibility outputs');
assert(read('scripts/metadata-worker-build.cjs').includes('core/node/embeddedMetadata/domain/tsconfig.json'), 'Native runtime must prepare compatibility outputs');
assert(read('scripts/metadata-worker-build.cjs').includes('require("./embedded-metadata-declarations.cjs")'), 'Preserve emitted shared type contract');
console.log('Embedded metadata boundaries passed: unchanged parser bodies, independent runtime closure and legacy forwarding.');
