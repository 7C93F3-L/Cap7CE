const { spawnSync } = require('node:child_process');
module.exports = root => {
  const command = [
    "$ErrorActionPreference='Stop'",
    "$prefix=[IO.Path]::GetFullPath($env:CAP_NATIVE_ROOT).TrimEnd('\\')+'\\'",
    "$owners=@(Get-CimInstance Win32_Process -Filter \"Name='Cap7CE.WinUI.exe'\")",
    "if(@($owners|Where-Object {-not $_.ExecutablePath}).Count -gt 0){exit 3}",
    "if(@($owners|Where-Object {$_.ExecutablePath.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)}).Count -gt 0){exit 2}"
  ].join('\n');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command],
    { windowsHide: true, env: { ...process.env, CAP_NATIVE_ROOT: root } });
  if (result.status !== 0) throw new Error('Close this checkout\'s WinUI application before building; existing artifacts were preserved.');
};
