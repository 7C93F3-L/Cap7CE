const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
(async () => {
  require('./native-build-safety.cjs')(root);
  const tools = require('./native-installer-tools.cjs');
  const compiler = await tools.getMakeNsisPath();
  const run = (exe, args) => {
    const r = spawnSync(exe, args, { cwd: root, stdio: 'inherit', windowsHide: true, env: { ...process.env, ...compiler.env } });
    if (r.error || r.status !== 0) throw r.error || new Error(`Installer preparation failed (${r.status}). No retries.`);
  };
  // Build a fresh payload unless explicitly given this run's native pack output.
  let payload = process.argv[2];
  if (!payload) {
    run(process.execPath, ['scripts/native-pack.cjs']);
    payload = fs.readdirSync(path.join(root, 'release'), { withFileTypes: true })
      .filter(e => e.isDirectory() && /^Cap7CE-.*-x64-\d+$/.test(e.name))
      .map(e => path.join(root, 'release', e.name)).sort((a,b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  }
  payload = path.resolve(payload);
  const marker = JSON.parse(fs.readFileSync(path.join(payload, 'cap7ce-native.json'), 'utf8'));
  if (marker.shell !== 'WinUI' || marker.version !== require('../package.json').version) throw new Error('Native payload identity mismatch.');
  const stage = path.join(root, 'release', `winui-installer-stage-${Date.now()}`);
  fs.mkdirSync(stage);
  const app = path.join(stage, 'app');
  fs.cpSync(payload, app, { recursive: true, filter: p => {
    const first = path.relative(payload, p).split(path.sep)[0];
    if (fs.lstatSync(p).isSymbolicLink()) throw new Error('Installer payload contains a link.');
    return !['models', 'llama.cpp', 'shell', 'Start-Cap7CE.cmd', 'README.txt'].includes(first);
  }});
  // Pair the installed apphost name with its PRI lookup name; keep the original PRI for assembly-qualified resources.
  fs.cpSync(path.join(payload, 'shell/artifacts/winui'), app, { recursive: true });
  fs.renameSync(path.join(app, 'Cap7CE.WinUI.exe'), path.join(app, 'Cap7CE.exe'));
  fs.copyFileSync(path.join(app, 'Cap7CE.WinUI.pri'), path.join(app, 'Cap7CE.pri'));
  fs.writeFileSync(path.join(app, 'cap7ce-native.json'), JSON.stringify({ ...marker, layout: 'installed-app' }));
  const notices = path.join(app, 'licenses/installer');
  fs.mkdirSync(notices, { recursive: true });
  for (const file of ['LGPL.txt', 'LGPL_CLARIFICATION.txt', 'ReadMe.txt'])
    fs.copyFileSync(path.join(tools.directory, 'stdutils', file), path.join(notices, 'StdUtils-' + file));
  fs.copyFileSync(path.join(tools.directory, 'nsis-3.12/COPYING'), path.join(notices, 'NSIS.txt'));
  fs.writeFileSync(path.join(notices, 'WinShell.txt'), 'WinShell 20121005, Anders. Freeware.\nhttps://nsis.sourceforge.io/WinShell_plug-in\n');
  const size = directory => fs.readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) =>
    sum + (entry.isDirectory() ? size(path.join(directory, entry.name)) : fs.statSync(path.join(directory, entry.name)).size), 0);
  const output = path.join(root, 'release/nsis-installer');
  fs.mkdirSync(output, { recursive: true });
  run(compiler.path, ['/WX', '/INPUTCHARSET', 'UTF8', '/V2', `/DPROJECT_DIR=${root}`, `/DSTAGED_APP=${app}`,
    `/DTOOLCHAIN_DIR=${tools.directory}`, `/DVERSION=${marker.version}`, `/DESTIMATED_SIZE=${Math.ceil(size(app) / 1024)}`,
    `/DOUTPUT_FILE=${path.join(output, `Cap7CE-Setup-${marker.version}-x64.exe`)}`, 'build/native-installer.nsi']);
  run(process.execPath, ['scripts/native-installer-smoke.cjs']);
  console.log(`Native NSIS installer built from ${stage}. No installation or release was performed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
