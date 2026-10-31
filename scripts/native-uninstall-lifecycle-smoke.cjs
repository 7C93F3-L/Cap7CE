const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Compile the actual NSIS functions/sections with every product path redirected
// into one owned fixture. No product registration, service or real user data.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap7ce-uninstall-lifecycle-'));
const { getMakeNsisPath } = require('app-builder-lib/out/toolsets/windows');
let compilerEnvironment;
const source = fs.readFileSync(path.join(__dirname, '../build/installer-custom.nsh'), 'utf8');
const run = (exe, args) => {
  const result = spawnSync(exe, args, { encoding: 'utf8', windowsHide: true, timeout: 20_000, env: compilerEnvironment });
  if (result.error || result.status !== 0) throw result.error || new Error(`${path.basename(exe)} exited ${result.status}: ${result.stdout}${result.stderr}`);
};
const put = file => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'fixture'); };
// Resolve exactly the compiler and plugin environment used by the real package.
(async () => { try {
  const tool = await getMakeNsisPath();
  const compiler = tool.path;
  compilerEnvironment = { ...process.env, ...tool.env };
  assert(fs.existsSync(compiler), 'Build the NSIS installer once before running this check.');
  for (const scenario of ['selected', 'unchecked', 'update', 'ai-selected', 'locked']) {
    const fixture = path.join(root, scenario);
    const installed = path.join(fixture, 'installed');
    const targets = ['local/Cap7CE', 'local/Cap7CE-PhaseF', 'local/cap7ce-updater', 'roaming/Cap7CE']
      .map(relative => path.join(fixture, relative));
    for (const target of targets) put(path.join(target, 'test.txt'));
    put(path.join(installed, 'Cap7CE.exe'));
    put(path.join(installed, 'cap7ce-native.json'));
    put(path.join(installed, 'models/model.bin'));
    fs.mkdirSync(path.join(installed, 'Core'), { recursive: true });
    if (scenario === 'update') {
      put(path.join(installed, 'Core/v1/Cap7CE.Core.Host.exe'));
      put(path.join(installed, 'NtfsReader/v1/Cap7CE.Core.Reader.Host.exe'));
      put(path.join(installed, 'CapabilitySetup/v1/ownership.json'));
    }
    const fixtureSource = source.replaceAll('$LOCALAPPDATA', '$fixtureLocal')
      .replaceAll('$APPDATA', '$fixtureRoaming').replaceAll('$PROGRAMFILES64', '$fixturePrograms')
      .replaceAll('$TEMP\\cap7ce-uninstall', fixture + '\\cap7ce-uninstall');
    const header = `Unicode true
RequestExecutionLevel user
SilentInstall silent
SilentUnInstall silent
!define BUILD_UNINSTALLER
!define PRODUCT_FILENAME "Cap7CE"
!define APP_INSTALLER_STORE_FILE "cap7ce-updater\\installer.exe"
!include FileFunc.nsh
!include Sections.nsh
Var fixtureLocal
Var fixtureRoaming
Var fixturePrograms
` +
      '!macro _isUpdated _a _b _t _f\n StrCmp "' + (scenario === 'update' ? '1' : '0') +
      '" "1" `${_t}` `${_f}`\n!macroend\n!define isUpdated `"" isUpdated ""`\n';
    const script = header + `OutFile "${fixture}\\generate.exe"
Section
 WriteUninstaller "${fixture}\\uninstall.exe"
SectionEnd
${fixtureSource}
Var installMode
Function un.onInit
 StrCpy $INSTDIR "${installed}"
 StrCpy $installMode "all"
 StrCpy $fixtureLocal "${fixture}\\local"
 StrCpy $fixtureRoaming "${fixture}\\roaming"
 StrCpy $fixturePrograms "${fixture}\\programs"
 SectionSetFlags 1 ${scenario === 'unchecked' ? 0 : 1}
 SectionSetFlags 2 ${scenario === 'ai-selected' ? 1 : 0}
FunctionEnd
Section "un.Main"
 !insertmacro customRemoveFiles
 FileOpen $0 "${fixture}\\application-removed.txt" w
 FileClose $0
SectionEnd
!insertmacro customUnInstallSection
`;
    const scriptPath = path.join(fixture, 'flow.nsi');
    fs.writeFileSync(scriptPath, script);
    run(compiler, ['/WX', '/INPUTCHARSET', 'UTF8', '/V2', scriptPath]);
    run(path.join(fixture, 'generate.exe'), []);
    const uninstaller = path.join(fixture, 'uninstall.exe');
    if (scenario === 'locked') {
      // Hold a real Windows deny-delete handle throughout the uninstall attempt.
      const quote = value => "'" + value.replaceAll("'", "''") + "'";
      const lock = path.join(targets[1], 'test.txt');
      const ps = `$h=[IO.File]::Open(${quote(lock)},'Open','Read','None'); try { ` +
        `Start-Process -FilePath ${quote(uninstaller)} -ArgumentList '/S',${quote('_?=' + installed)} -Wait -WindowStyle Hidden ` +
        '} finally { $h.Dispose() }';
      run('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')]);
      assert(fs.existsSync(lock), 'locked data must remain');
      assert(fs.existsSync(path.join(installed, 'Cap7CE.exe')), 'failed data cleanup must keep the application and retry entry');
      assert(!fs.existsSync(path.join(fixture, 'application-removed.txt')), 'application removal must not run after data cleanup failure');
      const diagnostic = fs.readFileSync(path.join(fixture, 'cap7ce-uninstall-data.log'), 'utf8');
      assert.equal(diagnostic.match(/Target=/g)?.length, 4, 'all cleanup targets must survive in the diagnostic');
      assert.match(diagnostic, /Win32Error=/);
      run(uninstaller, ['/S', '_?=' + installed]);
      for (const target of targets) assert(!fs.existsSync(target), 'retry must remove data after the lock is released');
      assert(!fs.existsSync(path.join(installed, 'Cap7CE.exe')));
      assert(fs.existsSync(path.join(installed, 'models/model.bin')));
    } else {
      run(uninstaller, ['/S', '_?=' + installed]);
      for (const target of targets) assert.equal(fs.existsSync(target), scenario === 'unchecked' || scenario === 'update', scenario + ': ' + target);
      assert(!fs.existsSync(path.join(installed, 'Cap7CE.exe')));
      assert.equal(fs.existsSync(path.join(installed, 'models/model.bin')), scenario !== 'ai-selected');
      if (scenario === 'update') {
        assert(fs.existsSync(path.join(installed, 'CapabilitySetup/v1/ownership.json')));
        assert(fs.existsSync(path.join(installed, 'Core/v1/Cap7CE.Core.Host.exe')));
        assert(fs.existsSync(path.join(installed, 'NtfsReader/v1/Cap7CE.Core.Reader.Host.exe')));
      } else assert(!fs.existsSync(path.join(installed, 'Core')), 'empty Core container must be removed');
      if (scenario === 'ai-selected') assert(!fs.existsSync(installed));
    }
  }
  console.log('NSIS lifecycle fixtures passed: selected/retained user data, update preservation, AI choice, empty directories, locked-data abort and successful retry. No system changes.');
} finally {
  assert(root.startsWith(path.join(os.tmpdir(), 'cap7ce-uninstall-lifecycle-')));
  fs.rmSync(root, { recursive: true, force: true });
} })().catch(error => { console.error(error); process.exitCode = 1; });
