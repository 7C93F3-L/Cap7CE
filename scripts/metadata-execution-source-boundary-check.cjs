const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto'), { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '..'), directory = 'core/node/metadataExecution/';
const paths = require('../core/node/metadataExecution/legacy-paths.json');
const baseline = require('../core/node/metadataExecution/source-baseline.json');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
assert.deepEqual(fs.readdirSync(path.join(root, directory)).filter(file => file.endsWith('.ts')).sort(), Object.keys(baseline).sort());
for (const [file, expected] of Object.entries(baseline)) {
  const source = read(directory + file);
  const normalized = source.replace(/((?:from|import)\s*|(?:require|import)\(\s*)(["'])(\.[^"']+)\2/g, '$1$2<module>$2').replace(/\r\n/g, '\n');
  assert.equal(createHash('sha256').update(normalized).digest('hex'), expected.sourceHash, `${file}: execution behavior changed`);
  assert(source.trimEnd().split(/\r?\n/).length <= expected.lines, `${file}: source limit exceeded`);
  assert(!/node:(?:net|https?|tls|dgram)|fetch\(|sqlite|fs\.(?:write|append|unlink|rename|rm|mkdir)/i.test(source), `${file}: read-only content execution boundary`);
}
const result = buildSync({ absWorkingDir: root, entryPoints: Object.keys(baseline).map(file => directory + file), outdir: 'unused',
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, metafile: true, logLevel: 'error' });
for (const file of Object.keys(result.metafile.inputs)) {
  const source = file.replaceAll('\\', '/');
  assert(source.startsWith(directory) || source.startsWith('core/node/fileFacts/domain/') || source.startsWith('core/node/resourceCatalog/domain/formats/'), `Metadata executor acquired a legacy/foreign implementation: ${file}`);
}
for (const [old, target] of Object.entries(paths)) {
  let relative = path.relative(path.dirname(path.join(root, old)), path.join(root, 'core/artifacts/file-facts', target)).replaceAll('\\', '/').replace(/\.ts$/, '');
  if (!relative.startsWith('.')) relative = './' + relative;
  assert.equal(read(old).replace(/\/\/[^\r\n]*/g, '').trim(), `export * from "${relative}";`, `${old}: compatibility entry only`);
}
assert(read('scripts/metadata-worker-build.cjs').includes('"core/node/metadataExecution/metadataWorkerProcess.ts"'), 'Native worker must bundle the canonical execution entry');
assert(read('scripts/metadata-extractor-manifest.cjs').includes("'core/node/metadataExecution/metadataBuildSpecifications.ts'"), 'Native manifest must bundle the canonical definitions');
assert(require('../core/node/fileFacts/domain/tsconfig.json').include.includes('../../metadataExecution/**/*.ts'), 'Shared compiler must emit adjacent domain outputs');
console.log('Metadata execution source boundaries passed: nine unchanged modules, independent closure and native entry/manifest ownership.');
