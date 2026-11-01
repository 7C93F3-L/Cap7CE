const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), version = require('../package.json').version;
if (process.platform !== 'win32') throw new Error('Native packaging requires Windows x64.');
require('./native-build-safety.cjs')(root);
const output = path.join(root, 'release', `Cap7CE-${version}-x64-${Date.now()}`);
if (!output.startsWith(path.join(root, 'release') + path.sep)) throw new Error('Invalid package destination');
fs.mkdirSync(output, { recursive: true });
const publish = (project, destination, properties = []) => {
  const result = spawnSync('dotnet', ['publish', project, '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true', '-p:DebugType=None', '-p:DebugSymbols=false', ...properties, '-o', path.join(output, destination)],
    { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw result.error || new Error('Self-contained publish failed');
};
publish('shell/Cap7CE.WinUI/Cap7CE.WinUI.csproj', 'shell/artifacts/winui', ['-p:Platform=x64']);
publish('core/src/Cap7CE.Core.Host/Cap7CE.Core.Host.csproj', 'core/artifacts/development-product-host', ['-p:P38ProductProfile=true']);
for (const folder of ['core/artifacts/configuration-host', 'core/artifacts/file-operations-host', 'native/artifacts/core-visuals/v1',
  'native/artifacts/metadata-media/v1', 'artifacts/metadata-worker/v1']) {
  const source = path.join(root, folder); if (!fs.existsSync(source)) throw new Error(`Missing runtime: ${folder}`);
  fs.cpSync(source, path.join(output, folder), { recursive: true, dereference: false, filter: item => {
    if (fs.lstatSync(item).isSymbolicLink()) throw new Error(`Runtime contains a link: ${item}`);
    return !/\.(pdb|db|sqlite|log)$/i.test(item);
  } });
}
const setup = path.join(root, 'core/artifacts/product-capability/v1/bundle');
if (!fs.existsSync(path.join(setup, 'Cap7CE.Core.Setup.exe'))) throw new Error('Core Setup bundle missing; run npm run build first.');
fs.cpSync(setup, path.join(output, 'core/artifacts/product-capability/v1/bundle'), { recursive: true });
fs.writeFileSync(path.join(output, 'cap7ce-native.json'), JSON.stringify({ product: 'Cap7CE', shell: 'WinUI', version, architecture: 'x64' }, null, 2));
fs.writeFileSync(path.join(output, 'Start-Cap7CE.cmd'), '@echo off\r\nstart "" "%~dp0shell\\artifacts\\winui\\Cap7CE.WinUI.exe"\r\n');
fs.writeFileSync(path.join(output, 'README.txt'), 'Cap7CE x64\r\nRun Start-Cap7CE.cmd. Keep all folders together.\r\nReader service is required for disk indexing. Existing Catalog/user data are reused, not bundled.\r\nUse the installer to configure the search service before indexing.\r\n');
require('./native-runtime-notices.cjs')(root, output);
for (const name of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md']) fs.copyFileSync(path.join(root, name), path.join(output, name));
fs.mkdirSync(path.join(output, 'models')); fs.mkdirSync(path.join(output, 'llama.cpp'));
if (process.argv.includes('--zip')) {
  const zip = path.join(root, 'release', `Cap7CE-${version}-x64.zip`);
  const command = 'Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:CAP_NATIVE_SOURCE,$env:CAP_NATIVE_ZIP)';
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command],
    { stdio: 'inherit', windowsHide: true, env: { ...process.env, CAP_NATIVE_SOURCE: output, CAP_NATIVE_ZIP: zip } });
  if (result.error || result.status !== 0) throw result.error || new Error('ZIP creation failed');
  console.log(zip);
}
console.log(`Independent native runtime: ${output}`);
