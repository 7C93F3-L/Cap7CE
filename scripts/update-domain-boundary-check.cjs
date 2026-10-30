const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '..');
const domain = 'core/node/applicationUpdates/domain';
const names = ['appUpdateService', 'appUpdateDownloadService', 'appUpdateTypes'];
for (const name of names) {
  const source = fs.readFileSync(path.join(root, domain, `${name}.ts`), 'utf8');
  assert(source.split('\n').length <= (name === 'appUpdateDownloadService' ? 530 : name === 'appUpdateService' ? 210 : 70), `${name}: domain size limit exceeded`);
  const legacy = fs.readFileSync(path.join(root, 'electron', `${name}.ts`), 'utf8').replace(/\/\/[^\r\n]*/g, '').trim();
  assert.equal(legacy, `export * from "../core/artifacts/application-updates/${name}";`, `${name}: legacy entry cannot duplicate implementation`);
}
const compiled = buildSync({ absWorkingDir: root, entryPoints: [`${domain}/appUpdateDownloadService.ts`],
  bundle: true, platform: 'node', format: 'cjs', write: false, metafile: true, logLevel: 'error' });
for (const file of Object.keys(compiled.metafile.inputs))
  assert(file.replaceAll('\\', '/').startsWith(domain + '/'), `Update domain acquired an outer dependency: ${file}`);
assert(fs.readFileSync(path.join(root, 'core/node/applicationUpdates/service.ts'), 'utf8').includes('"./domain/appUpdateDownloadService"'), 'native owner must use canonical source');
const pkg = require('../package.json');
assert(pkg.scripts['build:electron'].includes('npm run build:update-domain &&') && pkg.scripts['build:electron'].indexOf('npm run build:update-domain &&') < pkg.scripts['build:electron'].indexOf('tsc -p tsconfig.electron.json'), 'legacy compiler requires domain declarations first');
assert(pkg.build.files.includes('core/artifacts/application-updates/*.js'), 'legacy package requires the compatibility runtime');
console.log('Update domain boundaries passed: Node-only dependency closure, single implementation and legacy compilation/package handoff.');
