const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), manifest = require('../core/node/resourceCatalog/resource-manifest.json');
const generated = spawnSync(process.execPath, ['scripts/winui-resources.cjs'], { cwd: root, stdio: 'inherit', windowsHide: true });
assert.equal(generated.status, 0, 'Resource generation failed');
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const [name, hash] of Object.entries(manifest.generated))
  assert.equal(digest(path.join(root, 'shell/artifacts/assets', name)), hash, `${name}: generated resource behavior changed`);
for (const [name, hash] of Object.entries(manifest.icons))
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'resources/icons', name), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash, `${name}: migrated icon changed`);
for (const [name, hash] of Object.entries(manifest.branding))
  assert.equal(digest(path.join(root, 'resources/branding', name)), hash, `${name}: branding payload changed`);
console.log(`Resource parity passed: ${Object.keys(manifest.generated).length} JSON outputs and ${Object.keys(manifest.icons).length} original icons retain identical content (SVG line endings normalized).`);
