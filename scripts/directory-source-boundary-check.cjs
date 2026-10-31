const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto'), { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '..'), directory = 'core/node/directoryBrowse/source/';
const paths = require('../core/node/directoryBrowse/source/legacy-paths.json');
const baseline = require('../core/node/directoryBrowse/source/source-baseline.json');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
assert.deepEqual(fs.readdirSync(path.join(root, directory)).filter(file => file.endsWith('.ts')).sort(), Object.keys(baseline).map(file => path.basename(file)).sort());
for (const [file, expected] of Object.entries(baseline)) {
  const source = read(file);
  const normalized = source.replace(/((?:from|import)\s*|(?:require|import)\(\s*)(["'])(\.[^"']+)\2/g, '$1$2<module>$2').replace(/\r\n/g, '\n');
  assert.equal(createHash('sha256').update(normalized).digest('hex'), expected.sourceHash, `${file}: directory behavior changed`);
  assert(source.trimEnd().split(/\r?\n/).length <= expected.lines, `${file}: source limit exceeded`);
  assert(!/node:(?:net|https?)|BrowserWindow|ipcMain|ipcRenderer|sqlite|fs\.(?:write|rename|rm|unlink|mkdir)|setInterval\(/i.test(source), `${file}: read-only directory boundary`);
}
const result = buildSync({ absWorkingDir: root, entryPoints: Object.keys(baseline), outdir: 'unused',
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, metafile: true, logLevel: 'error' });
for (const file of Object.keys(result.metafile.inputs))
  assert(Object.hasOwn(baseline, file.replaceAll('\\', '/')) || file.replaceAll('\\', '/') === 'core/node/resourceCatalog/domain/formats/formatCapabilities.ts', `Directory reader acquired a foreign implementation: ${file}`);
for (const [old, target] of Object.entries(paths)) {
  let relative = path.relative(path.dirname(path.join(root, old)), path.join(root, 'core/artifacts/file-facts', target)).replaceAll('\\', '/').replace(/\.ts$/, '');
  if (!relative.startsWith('.')) relative = './' + relative;
  assert.equal(read(old).replace(/\/\/[^\r\n]*/g, '').trim(), `export * from "${relative}";`, `${old}: compatibility entry only`);
}
for (const file of ['core/node/directoryBrowse/owner.ts', 'core/node/directoryBrowse/policy.ts', 'core/node/directoryBrowse/recursive.ts', 'core/node/sourceInformation/inspection.ts'])
  assert(!/electron\//.test(read(file)), `${file}: native consumer must use canonical directory sources`);
assert(require('../core/node/fileFacts/domain/tsconfig.json').include.includes('../../directoryBrowse/source/**/*.ts'), 'Shared compiler must emit directory outputs');
console.log('Directory source boundaries passed: two unchanged sources, read-only closure, legacy forwarding and native browse/stat consumers.');
