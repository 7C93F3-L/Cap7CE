// Exercise the actual standalone installer with all write targets redirected.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { spawnSync, spawn } = require('node:child_process');
const tools = require('./native-installer-tools.cjs');
const project = path.resolve(__dirname, '..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'cap7ce-installer-flow-'));
const registration = 'Software\\Cap7CEInstallerTests\\' + path.basename(fixture);
const installed = path.join(fixture, '测试安装');
const put = (file, value = 'fixture') => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
let environment, held;
const run = (exe, args, expected = 0) => {
  const result = spawnSync(exe, args, { encoding: 'utf8', windowsHide: true, timeout: 30000, env: environment });
  assert.equal(result.status, expected, `${path.basename(exe)}: ${result.stdout}${result.stderr}` +
    (fs.existsSync(path.join(fixture, 'failure.txt')) ? fs.readFileSync(path.join(fixture, 'failure.txt'), 'utf8') : ''));
  return result.stdout;
};
(async () => { try {
  const compiler = await tools.getMakeNsisPath();
  environment = { ...process.env, ...compiler.env };
  const payload = path.join(fixture, 'payload');
  fs.mkdirSync(payload);
  const stub = path.join(fixture, 'stub.nsi');
  fs.writeFileSync(stub, `Unicode true
RequestExecutionLevel user
SilentInstall silent
OutFile "${payload}\\Cap7CE.exe"
Function .onInit
 FileOpen $0 "$EXEDIR\\called.txt" w
 FileWrite $0 "$CMDLINE"
 FileClose $0
 !include FileFunc.nsh
 \${GetParameters} $0
 StrCmp $0 "/hold" 0 done
 Sleep 30000
 done:
 SetErrorLevel 0
 Quit
FunctionEnd
Section
SectionEnd
`);
  run(compiler.path, ['/WX', '/V2', '/INPUTCHARSET', 'UTF8', stub]);
  put(path.join(payload, 'cap7ce-native.json'), '{"layout":"installed-app"}');
  const hook = path.join(fixture, 'lifecycle.nsh');
  let lifecycle = fs.readFileSync(path.join(project, 'build/installer-custom.nsh'), 'utf8');
  for (const [from, to] of [['$PROGRAMFILES64', 'programs'], ['$LOCALAPPDATA', 'local'], ['$APPDATA', 'roaming']])
    lifecycle = lifecycle.replaceAll(from, path.join(fixture, to));
  lifecycle = lifecycle.replaceAll('$TEMP\\cap7ce-uninstall', fixture + '\\cap7ce-uninstall');
  fs.writeFileSync(hook, lifecycle);
  let source = fs.readFileSync(path.join(project, 'build/native-installer.nsi'), 'utf8')
    .replace('RequestExecutionLevel admin', 'RequestExecutionLevel user')
    .replaceAll('HKLM', 'HKCU')
    .replaceAll('Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\d4b3d470-3007-5bc8-86ae-83016c5ca854', registration + '\\Uninstall')
    .replaceAll('Software\\d4b3d470-3007-5bc8-86ae-83016c5ca854', registration)
    .replaceAll('$PROGRAMFILES64\\Cap7CE', path.join(fixture, 'default'))
    .replaceAll('$DESKTOP', path.join(fixture, 'desktop'))
    .replaceAll('$SMPROGRAMS', path.join(fixture, 'start-menu'))
    .replace('!define APP_ID "Cap7CE"', `!define APP_ID "${path.basename(fixture)}"`)
    .replace('!include "${PROJECT_DIR}\\build\\installer-custom.nsh"', `!include "${hook}"`)
    .replace('Abort "$(invalidInstallDirectory)"', `FileOpen $1 "${fixture}\\failure.txt" w\nFileWrite $1 "$INSTDIR attributes=$0"\nFileClose $1\nAbort "$(invalidInstallDirectory)"`);
  assert(!source.includes('HKLM') && !source.includes('Software\\d4b3d470'));
  assert(!lifecycle.includes('$LOCALAPPDATA') && !lifecycle.includes('$PROGRAMFILES64'));
  const installer = path.join(fixture, 'Cap7CE-Fixture.exe'), script = path.join(fixture, 'setup.nsi');
  fs.writeFileSync(script, source);
  run(compiler.path, ['/WX', '/V2', '/INPUTCHARSET', 'UTF8', `/DPROJECT_DIR=${project}`, `/DTOOLCHAIN_DIR=${tools.directory}`,
    `/DSTAGED_APP=${payload}`, '/DVERSION=2.0.0', '/DESTIMATED_SIZE=1', `/DOUTPUT_FILE=${installer}`, script]);
  for (const folder of ['desktop', 'start-menu']) fs.mkdirSync(path.join(fixture, folder));
  run('reg.exe', ['add', 'HKCU\\' + registration, '/v', 'InstallLocation', '/d', installed, '/f', '/reg:64']);
  put(path.join(installed, 'app/Cap7CE.exe'));
  put(path.join(installed, 'app/cap7ce-native.json'), '{}');
  put(path.join(installed, 'app/old-only.txt'));
  put(path.join(installed, 'models/model.gguf'));
  put(path.join(installed, 'llama.cpp/runtime/llama-server.exe'));
  put(path.join(fixture, 'local/Cap7CE/config.json'));
  run(installer, ['/S']);
  assert(!fs.existsSync(path.join(installed, 'app/old-only.txt')), 'upgrade must replace app files');
  assert(fs.readFileSync(path.join(installed, 'app/called.txt'), 'utf8').includes('--install-search-service'));
  for (const file of ['Cap7CE.lnk', 'models/model.gguf', 'llama.cpp/runtime/llama-server.exe', 'Uninstall Cap7CE.exe'])
    assert(fs.existsSync(path.join(installed, file)), file);
  for (const folder of ['desktop', 'start-menu']) {
    const link = path.join(fixture, folder, 'Cap7CE.lnk');
    environment.CAP7CE_TEST_LINK = link;
    const target = run('powershell.exe', ['-NoProfile', '-Command', '[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); (New-Object -ComObject WScript.Shell).CreateShortcut($env:CAP7CE_TEST_LINK).TargetPath'], 0);
    assert.equal(target.trim().toLowerCase(), path.join(installed, 'app/Cap7CE.exe').toLowerCase(), 'shortcut must target the native entry');
  }
  const unknown = path.join(fixture, 'unknown');
  put(path.join(unknown, 'app/sentinel.txt'));
  run(installer, ['/S', '/D=' + unknown], 1);
  assert(fs.existsSync(path.join(unknown, 'app/sentinel.txt')), 'unknown app folder must survive');
  const junction = path.join(fixture, 'junction');
  fs.mkdirSync(junction);
  fs.symlinkSync(payload, path.join(junction, 'app'), 'junction');
  run(installer, ['/S', '/D=' + junction], 1);
  assert(fs.existsSync(path.join(payload, 'Cap7CE.exe')), 'installer must reject linked app directories');
  held = spawn(path.join(installed, 'app/Cap7CE.exe'), ['/hold'], { windowsHide: true });
  await new Promise(resolve => setTimeout(resolve, 250));
  run(installer, ['/S'], 2);
  held.kill(); await new Promise(resolve => held.once('exit', resolve)); held = undefined;
  run(path.join(installed, 'Uninstall Cap7CE.exe'), ['/S', '_?=' + installed]);
  assert(!fs.existsSync(path.join(installed, 'app')), 'uninstall must remove app');
  assert(fs.existsSync(path.join(installed, 'models/model.gguf')), 'unchecked models must survive');
  assert(fs.existsSync(path.join(fixture, 'local/Cap7CE/config.json')), 'unchecked user data must survive');
  for (const folder of ['desktop', 'start-menu']) assert(!fs.existsSync(path.join(fixture, folder, 'Cap7CE.lnk')));
  run('reg.exe', ['query', 'HKCU\\' + registration, '/reg:64'], 1);
  console.log('Standalone NSIS flow passed: registered directory, upgrade, mandatory setup, shortcuts, running-process guard, unsafe paths and data-preserving uninstall.');
} finally {
  held?.kill();
  spawnSync('reg.exe', ['delete', 'HKCU\\' + registration, '/f', '/reg:64'], { windowsHide: true, stdio: 'ignore' });
  assert.equal(path.dirname(fixture), path.resolve(os.tmpdir()));
  assert(path.basename(fixture).startsWith('cap7ce-installer-flow-'));
  fs.rmSync(fixture, { recursive: true, force: true });
} })().catch(error => { console.error(error); process.exitCode = 1; });
