const path = require("node:path"), { spawnSync } = require("node:child_process");
module.exports.assertStopped = outputRoot => {
  const powershell = path.join(process.env.SystemRoot || "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
  const result = spawnSync(powershell, ["-NoProfile", "-NonInteractive", "-Command", [
    "$ErrorActionPreference='Stop'",
    "$target=[IO.Path]::GetFullPath($env:CAP7CE_NODE_OUTPUT).TrimEnd('\\')+'\\node.exe'",
    "$owners=@(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\")",
    "if(@($owners|Where-Object {-not $_.ExecutablePath}).Count -gt 0){exit 3}",
    "if(@($owners|Where-Object {$_.ExecutablePath.Equals($target,[StringComparison]::OrdinalIgnoreCase)}).Count -gt 0){exit 2}"
  ].join("\n")], { windowsHide: true, encoding: "utf8", env: { ...process.env, CAP7CE_NODE_OUTPUT: outputRoot } });
  if (result.status === 2) throw new Error("core-node-runtime-in-use: close its development app before rebuilding; existing resources were preserved.");
  if (result.status !== 0) throw new Error("core-node-runtime-owner-check-failed: existing resources were preserved.");
};
