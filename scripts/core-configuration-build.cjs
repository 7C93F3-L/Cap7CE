const path = require("node:path"), { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const result = spawnSync("dotnet", ["publish", "core/src/Cap7CE.Core.Configuration.Host/Cap7CE.Core.Configuration.Host.csproj",
  "--configuration", "Release", "--runtime", "win-x64", "--self-contained", "true", "--nologo",
  "--output", "core/artifacts/configuration-host", "-p:RestoreLockedMode=true", "-p:DebugType=None", "-p:DebugSymbols=false"], {
  cwd: root, stdio: "inherit", windowsHide: true, env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" }
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
