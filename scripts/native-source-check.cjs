const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { buildSync } = require('esbuild'), { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'), read = file => fs.readFileSync(path.join(root, file), 'utf8');
const walk = directory => fs.readdirSync(path.join(root, directory), { withFileTypes: true })
  .flatMap(item => item.isDirectory() ? walk(directory + '/' + item.name) : [directory + '/' + item.name]);
for (const file of ['electron', 'src', 'dist', 'dist-electron', 'index.html', 'vite.config.ts', 'tsconfig.electron.json'])
  assert(!fs.existsSync(path.join(root, file)), `Retired application surface reintroduced: ${file}`);
const configuration = require('../package.json');
const compiler = require('../tsconfig.json').compilerOptions;
assert(compiler.noEmit && compiler.noEmitOnError, 'Native type checking must never emit source-adjacent JS');
assert(![...walk('core/node'), ...walk('core/shared')].some(file => file.endsWith('.js')), 'Generated JS must stay outside canonical source directories');
for (const name of ['electron', 'react', 'react-dom', 'react-markdown', 'remark-gfm', 'vite', '@vitejs/plugin-react'])
  assert(!configuration.dependencies?.[name] && !configuration.devDependencies?.[name], `Retired dependency reintroduced: ${name}`);
assert(!Object.keys(configuration.scripts).some(name => /legacy|renderer|electron|preload/.test(name)), 'Retired command reintroduced');
const limits = require('./native-source-limits.json');
const sources = [...walk('core/node'), ...walk('core/shared')].filter(file => file.endsWith('.ts'));
assert.deepEqual(sources.sort(), Object.keys(limits).sort(), 'Register native source ownership and size limits');
for (const file of sources) {
  const source = read(file);
  assert(source.trimEnd().split(/\r?\n/).length <= limits[file], `${file}: native module size exceeded`);
  assert(!/(?:from\s*|require\(\s*|import\(\s*)["']electron["']|(?:from\s*|require\(\s*|import\(\s*)["'][^"']*(?:src\/renderer|electron\/)/.test(source), `${file}: legacy implementation dependency`);
}
// Retain migration body checks while relative contract locations move.
for (const file of walk('core/node').filter(file => file.endsWith('/source-baseline.json'))) {
  for (const [name, expected] of Object.entries(JSON.parse(read(file)))) {
    const adjacent = path.posix.join(path.posix.dirname(file), name);
    const sourceFile = name.startsWith('core/') ? name : fs.existsSync(path.join(root, adjacent)) ? adjacent : path.posix.join(path.posix.dirname(file), 'domain', name);
    const normalized = read(sourceFile).replace(/((?:from|import)\s*|(?:require|import)\(\s*)(["'])(\.[^"']+)\2/g, '$1$2<module>$2').replace(/\r\n/g, '\n');
    assert.equal(createHash('sha256').update(normalized).digest('hex'), expected.sourceHash, `${sourceFile}: migrated behavior changed`);
  }
}
const entries = ['metadataExecution/metadataWorkerProcess.ts', 'visualRendering/worker.ts', 'visualCache/host.ts',
  'modelRuntime/host.ts', 'providerPreview/host.ts', 'officePreview/host.ts', 'textPreview/worker.ts', 'interactiveMetadata/worker.ts', 'storedMetadata/worker.ts'];
const result = buildSync({ absWorkingDir: root, entryPoints: entries.map(file => 'core/node/' + file), outdir: 'unused', bundle: true,
  platform: 'node', format: 'cjs', packages: 'external', write: false, metafile: true, logLevel: 'error' });
for (const file of Object.keys(result.metafile.inputs))
  assert(/^core\/(node|shared)\//.test(file.replaceAll('\\', '/')), `Native runtime depends on a foreign/generated implementation: ${file}`);
for (const output of Object.values(result.metafile.outputs))
  assert(!output.imports.some(item => item.path === 'electron'), 'Electron runtime dependency');
require('./native-domain-check.cjs')(read);
console.log(`Native source boundaries passed: ${sources.length} source limits, preserved parser bodies, nine independent runtime entries and no retired shell.`);
