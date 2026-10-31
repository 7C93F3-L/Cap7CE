const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
if (process.platform !== 'win32') throw new Error('WinUI builds require Windows x64.');
require('./native-build-safety.cjs')(root);
const run = (exe, args) => {
  const result = spawnSync(exe, args, { cwd: root, stdio: 'inherit', windowsHide: true,
    env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${exe} ${args[0]} failed (${result.status}).`);
};
const node = script => run(process.execPath, [path.join('scripts', script)]);
const prerequisites = [
  ['native/artifacts/core-visuals/v1/Cap7CE.Core.Visuals.exe', 'core-visuals-build.cjs'],
  ['native/artifacts/metadata-media/v1/Cap7CE.Media.Metadata.exe', 'metadata-media-build.cjs'],
  ['core/artifacts/configuration-host/Cap7CE.Core.Configuration.Host.exe', 'core-configuration-build.cjs'],
  ['core/artifacts/file-operations-host/Cap7CE.Core.FileOperations.Host.exe', 'core-file-operations-build.cjs']
];
for (const [target, script] of prerequisites) if (!fs.existsSync(path.join(root, target)) || script==='core-file-operations-build.cjs'&&!require('./core-file-operations-freshness.cjs').isFresh(root)) node(script);
if (!fs.existsSync(path.join(root, 'core/artifacts/product-capability/v1/bundle/Cap7CE.Core.Setup.exe')))
  run(process.execPath, ['scripts/core-capability-payload-build.cjs', '--product']);
node('native-source-check.cjs');
node('core-architecture-suite.cjs');
run(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json']);
node('metadata-worker-build.cjs');
// Same product profile used by the existing mainline. No Reader install or user-data activation during build.
const coreOutput = path.join(root, 'core/artifacts/development-product-host');
require('./core-development-host-safety.cjs').assertStopped(coreOutput);
run('dotnet', ['publish', 'core/src/Cap7CE.Core.Host/Cap7CE.Core.Host.csproj', '-c', 'Release', '-r', 'win-x64',
  '--self-contained', 'false', '-p:P38ProductProfile=true', '-o', coreOutput]);
node('winui-resources.cjs');
run('dotnet', ['publish', 'shell/Cap7CE.QueryHost/Cap7CE.QueryHost.csproj', '-c', 'Release', '--self-contained', 'false', '-o', 'shell/artifacts/query']);
run('dotnet', ['build', 'shell/Cap7CE.WinUI/Cap7CE.WinUI.csproj', '-c', 'Release', '-p:Platform=x64', '-o', 'shell/artifacts/winui']);
node('winui-shell-boundary-check.cjs');
console.log('Native WinUI build passed. No Electron application was built or started.');
