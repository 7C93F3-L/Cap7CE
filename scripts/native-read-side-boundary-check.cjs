const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto'), { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '..');
const paths = require('../core/node/visualRendering/shell/legacy-paths.json');
const baseline = require('../core/node/visualRendering/shell/source-baseline.json');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
for (const [file, expected] of Object.entries(baseline)) {
  const source = read(file);
  const normalized = source.replace(/((?:from|import)\s*|(?:require|import)\(\s*)(["'])(\.[^"']+)\2/g, '$1$2<module>$2').replace(/\r\n/g, '\n');
  assert.equal(createHash('sha256').update(normalized).digest('hex'), expected.sourceHash, `${file}: read-side behavior changed`);
  assert(source.trimEnd().split(/\r?\n/).length <= expected.lines, `${file}: source limit exceeded`);
}
const entryPoints = ['metadataExecution/metadataWorkerProcess.ts', 'visualRendering/worker.ts', 'visualCache/host.ts',
  'modelRuntime/host.ts', 'providerPreview/host.ts', 'officePreview/host.ts', 'textPreview/worker.ts', 'interactiveMetadata/worker.ts', 'storedMetadata/worker.ts']
  .map(file => 'core/node/' + file);
const result = buildSync({ absWorkingDir: root, entryPoints, outdir: 'unused', bundle: true, platform: 'node', format: 'cjs',
  packages: 'external', write: false, metafile: true, logLevel: 'error' });
for (const file of Object.keys(result.metafile.inputs))
  assert(file.replaceAll('\\', '/').startsWith('core/node/'), `Native runtime acquired a legacy/generated implementation: ${file}`);
for (const output of Object.values(result.metafile.outputs))
  for (const dependency of output.imports)
    assert(dependency.path !== 'electron', 'Native runtime acquired the Electron package');
for (const [old, target] of Object.entries(paths).filter(([file]) => file.includes('Projection'))) {
  let relative = path.relative(path.dirname(path.join(root, old)), path.join(root, 'core/artifacts/file-facts', target)).replaceAll('\\', '/').replace(/\.ts$/, '');
  if (!relative.startsWith('.')) relative = './' + relative;
  assert.equal(read(old).replace(/\/\/[^\r\n]*/g, '').trim(), `export * from "${relative}";`, `${old}: compatibility entry only`);
}
const thumbnail = read('electron/core/coreShellThumbnail.ts');
assert(thumbnail.trimEnd().split(/\r?\n/).length <= 5);
assert(thumbnail.includes('executable = coreVisualExecutable(), timeoutMs = 15000'));
assert(thumbnail.includes('request(source, edge, executable, timeoutMs)'));
assert(!/\bspawn\(|node:fs|new VisualCacheFrameReader/.test(thumbnail), 'Old Shell adapter regained execution ownership');
const vector = read('electron/vectorDocumentRenderService.ts');
assert(vector.trimEnd().split(/\r?\n/).length <= 7);
assert(vector.includes('thumbnail, temporaryDirectory)'));
assert(!/node:fs|writeFile|crypto|readEpsEmbeddedPreview/.test(vector), 'Old vector adapter regained rendering ownership');
assert.equal(read('core/node/visualRendering/shell/resources.ts').trim(), 'export { visualNativeExecutable as coreVisualExecutable } from "../resources";');
console.log(`Native read-side closure passed: ${entryPoints.length} runtime entries use only core/node sources; projections and Shell fallback preserve behavior.`);
