const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
require('./native-build-safety.cjs')(root);
const run = (exe, args) => {
  const r = spawnSync(exe, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (r.error || r.status !== 0) throw r.error || new Error(`Installer preparation failed (${r.status}). No retries.`);
};
// Build a fresh payload unless explicitly given this run's native pack output.
let payload = process.argv[2];
if (!payload) {
  run(process.execPath, ['scripts/native-pack.cjs']);
  payload = fs.readdirSync(path.join(root, 'release'), { withFileTypes: true })
    .filter(e => e.isDirectory() && /^Cap7CE-.*-winui-x64-\d+$/.test(e.name))
    .map(e => path.join(root, 'release', e.name)).sort((a,b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}
payload = path.resolve(payload);
const marker = JSON.parse(fs.readFileSync(path.join(payload, 'cap7ce-native.json'), 'utf8'));
if (marker.shell !== 'WinUI' || marker.version !== require('../package.json').version) throw new Error('Native payload identity mismatch.');
const stage = path.join(root, 'release', `winui-installer-stage-${Date.now()}`);
fs.mkdirSync(stage);
fs.cpSync(payload, stage, { recursive: true, filter: p => {
  const first = path.relative(payload, p).split(path.sep)[0];
  if (fs.lstatSync(p).isSymbolicLink()) throw new Error('Installer payload contains a link.');
  return !['models', 'llama.cpp', 'shell', 'Start-Cap7CE.cmd', 'README.txt'].includes(first);
}});
// Pair the installed apphost name with its PRI lookup name; keep the original PRI for assembly-qualified resources.
fs.cpSync(path.join(payload, 'shell/artifacts/winui'), stage, { recursive: true });
fs.renameSync(path.join(stage, 'Cap7CE.WinUI.exe'), path.join(stage, 'Cap7CE.exe'));
fs.copyFileSync(path.join(stage, 'Cap7CE.WinUI.pri'), path.join(stage, 'Cap7CE.pri'));
fs.mkdirSync(path.join(stage, 'resources'), { recursive: true });
run(process.execPath, ['node_modules/electron-builder/out/cli/cli.js', '--win', 'nsis', '--x64', '--publish', 'never',
  '--config', 'build/winui.electron-builder.cjs', '--prepackaged', stage]);
run(process.execPath, ['scripts/native-installer-smoke.cjs']);
console.log(`WinUI installer built from ${stage}. No installation or release was performed.`);
