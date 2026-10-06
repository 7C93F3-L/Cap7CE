const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const result = spawnSync("dotnet", ["publish", "native/Cap7CE.Media.Metadata/Cap7CE.Media.Metadata.csproj",
  "--configuration", "Release", "--runtime", "win-x64", "--self-contained", "true", "--nologo",
  "--output", "native/artifacts/metadata-media/v1", "-p:RestoreLockedMode=true", "-p:DebugType=None", "-p:DebugSymbols=false"], {
  cwd: root, stdio: "inherit", windowsHide: true,
  env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" }
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
