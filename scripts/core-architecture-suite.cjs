const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const checks = fs.readdirSync(__dirname).filter(name => name.endsWith('architecture-check.cjs')).sort();
for (const name of checks) {
  const result = spawnSync(process.execPath, [path.join(__dirname, name)], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw result.error || Error(`${name} failed (${result.status}).`);
}
console.log(`Core architecture suite passed: ${checks.length} source audits; no probe or system mutation executed.`);
