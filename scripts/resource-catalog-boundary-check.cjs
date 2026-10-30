const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '..'), domain = 'core/node/resourceCatalog/domain/';
const paths = require('../core/node/resourceCatalog/legacy-paths.json');
const limits = require('../core/node/resourceCatalog/source-limits.json');
for (const [file, maximum] of Object.entries(limits))
  assert(fs.readFileSync(path.join(root, domain, file), 'utf8').trimEnd().split(/\r?\n/).length <= maximum, `${file}: resource source limit exceeded`);
const result = buildSync({ absWorkingDir: root, stdin: { contents: [
  `export * from './${domain}formats/formatCapabilities';`,
  `export * from './${domain}formats/visualPropertySemantics';`,
  `export * from './${domain}filters/computerSearchArchiveConditions';`,
  `export * from './${domain}commands/catalogCommandReference';`,
  `export * from './${domain}commands/shortcutActions';`,
  `export * from './${domain}localization/localization';`
].join('\n'), resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', write: false, metafile: true, logLevel: 'error' });
for (const file of Object.keys(result.metafile.inputs))
  assert(file === '<stdin>' || file.replaceAll('\\', '/').startsWith(domain), `Resource catalog acquired a runtime dependency: ${file}`);
for (const [old, target] of Object.entries(paths)) {
  const source = fs.readFileSync(path.join(root, old), 'utf8').replace(/\/\/[^\r\n]*/g, '').trim();
  const destination = old.startsWith('electron/') ? `core/artifacts/resource-catalog/${target}` : target;
  let relative = path.relative(path.dirname(path.join(root, old)), path.join(root, destination)).replaceAll('\\', '/').replace(/\.ts$/, '');
  if (!relative.startsWith('.')) relative = './' + relative;
  assert.equal(source, `export * from "${relative}";`, `${old}: legacy file must forward to its canonical owner`);
  assert(fs.existsSync(path.join(root, target)), `${old}: canonical definition missing`);
}
for (const file of ['winui-resources.cjs', 'winui-filter-resources.cjs', 'winui-advanced-filter-resources.cjs', 'winui-settings-resources.cjs', 'winui-sidebar-assets.cjs'])
  assert(!/['"](?:\.\/)?(?:electron\/|src\/renderer\/)/.test(fs.readFileSync(path.join(root, 'scripts', file), 'utf8')), `${file}: generator cannot depend on a legacy source`);
console.log(`Resource catalog boundaries passed: ${Object.keys(paths).length} canonical modules, no React/Electron/Renderer runtime dependency.`);
