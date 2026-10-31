const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto'), { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '..');
const paths = require('../core/node/modelRuntime/policy/legacy-paths.json');
const baseline = require('../core/node/modelRuntime/policy/source-baseline.json');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
for (const folder of ['core/node/modelRuntime/policy/', 'core/node/localKeywords/policy/'])
  assert.deepEqual(fs.readdirSync(path.join(root, folder)).filter(file => file.endsWith('.ts')).sort(), Object.keys(baseline).filter(file => file.startsWith(folder)).map(file => path.basename(file)).sort());
for (const [file, expected] of Object.entries(baseline)) {
  const source = read(file);
  const normalized = source.replace(/((?:from|import)\s*|(?:require|import)\(\s*)(["'])(\.[^"']+)\2/g, '$1$2<module>$2').replace(/\r\n/g, '\n');
  assert.equal(createHash('sha256').update(normalized).digest('hex'), expected.sourceHash, `${file}: policy behavior changed`);
  assert(source.trimEnd().split(/\r?\n/).length <= expected.lines, `${file}: source limit exceeded`);
  assert(!/node:|fetch\(|BrowserWindow|ipcMain|ipcRenderer|setInterval\(|sqlite/i.test(source), `${file}: policy-only boundary`);
}
const result = buildSync({ absWorkingDir: root, entryPoints: Object.keys(baseline), outdir: 'unused',
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, metafile: true, logLevel: 'error' });
for (const file of Object.keys(result.metafile.inputs))
  assert(Object.hasOwn(baseline, file.replaceAll('\\', '/')) || file.replaceAll('\\', '/').startsWith('core/node/resourceCatalog/domain/localization/'), `Policy acquired a foreign implementation: ${file}`);
for (const [old, target] of Object.entries(paths)) {
  const output = old === 'electron/modelRuntimeInitialState.ts' ? 'core/artifacts/resource-catalog' : 'core/artifacts/file-facts';
  let relative = path.relative(path.dirname(path.join(root, old)), path.join(root, output, target)).replaceAll('\\', '/').replace(/\.ts$/, '');
  if (!relative.startsWith('.')) relative = './' + relative;
  assert.equal(read(old).replace(/\/\/[^\r\n]*/g, '').trim(), `export * from "${relative}";`, `${old}: compatibility entry only`);
}
for (const folder of ['core/node/modelRuntime', 'core/node/modelSettings', 'core/node/localKeywords'])
  for (const file of fs.readdirSync(path.join(root, folder)).filter(file => file.endsWith('.ts')))
    assert(!/electron\//.test(read(folder + '/' + file)), `${folder}/${file}: native implementation still depends on a legacy source`);
assert(require('../core/node/resourceCatalog/domain/tsconfig.json').include.includes('../../modelRuntime/policy/modelRuntimeInitialState.ts'), 'Initial state must share the existing language singleton compilation');
console.log('Model/keyword policy boundaries passed: four unchanged policies, independent closure, legacy forwarding and native consumers.');
