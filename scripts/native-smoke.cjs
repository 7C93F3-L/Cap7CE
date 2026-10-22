const path = require('node:path'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const result = spawnSync('dotnet', ['run', '--project', 'shell/Cap7CE.Smoke/Cap7CE.Smoke.csproj', '-c', 'Release', '--', root],
  { cwd: root, stdio: 'inherit', windowsHide: true, timeout: 60000,
    env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' } });
if (result.error || result.status !== 0) throw result.error || new Error(`Native smoke failed (${result.status}). No automatic retries.`);
