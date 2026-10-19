const path = require("node:path"), { spawnSync } = require("node:child_process");
module.exports.assertStopped = outputRoot => {
  const powershell = path.join(process.env.SystemRoot || "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
  const result = spawnSync(powershell, ["-NoProfile", "-NonInteractive", "-Command", [
    "$ErrorActionPreference='Stop'",
    "$prefix=[IO.Path]::GetFullPath($env:CAP7CE_DEVELOPMENT_OUTPUT).TrimEnd('\\')+'\\'",
    "$owners=@(Get-CimInstance Win32_Process -Filter \"Name='Cap7CE.Core.Host.exe'\")",
    "if(@($owners|Where-Object {-not $_.ExecutablePath}).Count -gt 0){exit 3}",
    "if(@($owners|Where-Object {$_.ExecutablePath.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)}).Count -gt 0){exit 2}"
  ].join("\n")], { windowsHide: true, encoding: "utf8", env: { ...process.env, CAP7CE_DEVELOPMENT_OUTPUT: outputRoot } });
  if (result.status === 2) throw new Error("development-host-in-use: close the running development app before publishing Core.");
  if (result.status !== 0) throw new Error("development-host-owner-check-failed: existing output was preserved.");
};
