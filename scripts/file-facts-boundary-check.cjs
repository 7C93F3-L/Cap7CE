const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto'), { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '..'), domain = 'core/node/fileFacts/domain/';
const paths = require('../core/node/fileFacts/legacy-paths.json');
const baseline = require('../core/node/fileFacts/source-baseline.json');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
assert.deepEqual(fs.readdirSync(path.join(root, domain)).filter(file => file.endsWith('.ts')).sort(), Object.keys(baseline).sort());
for (const [file, expected] of Object.entries(baseline)) {
  const source = read(domain + file);
  const normalized = source.replace(/((?:from|import)\s*|require\(\s*)(["'])(\.[^"']+)\2/g, '$1$2<module>$2').replace(/\r\n/g, '\n');
  assert.equal(createHash('sha256').update(normalized).digest('hex'), expected.sourceHash, `${file}: parser behavior changed`);
  assert(source.trimEnd().split(/\r?\n/).length <= expected.lines, `${file}: source limit exceeded`);
}
const result = buildSync({ absWorkingDir: root, entryPoints: Object.keys(baseline).map(file => domain + file), outdir: 'unused',
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, metafile: true, logLevel: 'error' });
for (const file of Object.keys(result.metafile.inputs))
  assert(file.replaceAll('\\', '/').startsWith(domain), `File-fact parser acquired a foreign runtime implementation: ${file}`);
for (const [old, target] of Object.entries(paths)) {
  let relative = path.relative(path.dirname(path.join(root, old)), path.join(root, 'core/artifacts/file-facts', target)).replaceAll('\\', '/').replace(/\.ts$/, '');
  if (!relative.startsWith('.')) relative = './' + relative;
  assert.equal(read(old).replace(/\/\/[^\r\n]*/g, '').trim(), `export * from "${relative}";`, `${old}: compatibility entry only`);
}
const configuration = require('../package.json');
for (const task of ['build:electron', 'build:legacy'])
  assert(configuration.scripts[task].startsWith('npm run build:file-facts &&'), `${task}: compile parser outputs first`);
assert(configuration.build.files.includes('core/artifacts/file-facts/**/*.js'), 'Legacy package includes canonical parsers');
assert(configuration.build.asarUnpack.includes('core/artifacts/file-facts/**/*.js'), 'Legacy parser threads and adjacent dependencies stay outside ASAR');
assert(read('scripts/metadata-worker-build.cjs').includes('`core/node/fileFacts/domain/${name}.ts`'), 'Native runtime bundles canonical parser threads');
assert(!/from ["']\.\.\/(?:audioFactInspector|videoFactInspector|fontFactInspector|modelFactInspector)["']/.test(read('electron/metadataExtraction/metadataWorkerProcess.ts')), 'Native task assembly must use canonical parser implementations');
console.log('File-fact boundaries passed: 15 unchanged implementations, independent closure, legacy forwarding and adjacent worker packaging.');
