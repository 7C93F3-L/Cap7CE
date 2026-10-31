const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto'), { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '..');
const paths = require('../core/node/providerPreview/readers/legacy-paths.json');
const baseline = require('../core/node/providerPreview/readers/source-baseline.json');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
for (const folder of ['core/node/providerPreview/readers/', 'core/node/textPreview/contracts/'])
  assert.deepEqual(fs.readdirSync(path.join(root, folder)).filter(file => file.endsWith('.ts')).sort(), Object.keys(baseline).filter(file => file.startsWith(folder)).map(file => path.basename(file)).sort());
for (const [file, expected] of Object.entries(baseline)) {
  const source = read(file);
  const normalized = source.replace(/((?:from|import)\s*|(?:require|import)\(\s*)(["'])(\.[^"']+)\2/g, '$1$2<module>$2').replace(/\r\n/g, '\n');
  assert.equal(createHash('sha256').update(normalized).digest('hex'), expected.sourceHash, `${file}: preview behavior changed`);
  assert(source.trimEnd().split(/\r?\n/).length <= expected.lines, `${file}: source limit exceeded`);
  assert(!/BrowserWindow|ipcMain|ipcRenderer|sqlite|node:(?:net|https?|child_process)|fs\.(?:write|rename|rm|unlink)|setInterval\(/i.test(source), `${file}: bounded read-only preview boundary`);
}
const result = buildSync({ absWorkingDir: root, entryPoints: Object.keys(baseline), outdir: 'unused',
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, metafile: true, logLevel: 'error' });
for (const file of Object.keys(result.metafile.inputs))
  assert(Object.hasOwn(baseline, file.replaceAll('\\', '/')), `Preview reader acquired a foreign implementation: ${file}`);
for (const [old, target] of Object.entries(paths)) {
  let relative = path.relative(path.dirname(path.join(root, old)), path.join(root, 'core/artifacts/file-facts', target)).replaceAll('\\', '/').replace(/\.ts$/, '');
  if (!relative.startsWith('.')) relative = './' + relative;
  assert.equal(read(old).replace(/\/\/[^\r\n]*/g, '').trim(), `export * from "${relative}";`, `${old}: compatibility entry only`);
}
const builder = read('scripts/metadata-worker-build.cjs');
for (const name of ['epub', 'mobi'])
  assert(builder.includes(`"core/node/providerPreview/readers/${name}PreviewWorker.ts", "${name}PreviewWorker.js"`), `Native runtime bundles canonical ${name} reader`);
for (const file of ['core/node/textPreview/reader.ts', 'core/node/textPreview/owner.ts', 'core/node/providerPreview/font.ts'])
  assert(!/electron\//.test(read(file)), `${file}: native owner must use canonical preview contracts`);
assert(require('../package.json').build.asarUnpack.includes('core/artifacts/file-facts/**/*.js'), 'Legacy threads and adjacent dependencies stay outside ASAR');
console.log('Preview reader boundaries passed: five unchanged sources, read-only closure, legacy forwarding and native EPUB/MOBI entries.');
