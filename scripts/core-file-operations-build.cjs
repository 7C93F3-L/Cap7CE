const fs = require("node:fs"), path = require("node:path"), { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, ".."), output = path.join(root, "core/artifacts/file-operations-host");
const tools = path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft Visual Studio/Installer/vswhere.exe");
const locate = spawnSync(tools, ["-latest", "-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath"], { encoding: "utf8", windowsHide: true });
if (locate.status !== 0 || !locate.stdout.trim()) throw new Error("Native Core file operations require the installed x64 C++ build tools.");
const setup = path.join(locate.stdout.trim(), "VC/Auxiliary/Build/vcvars64.bat");
const vars = spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `""${setup}" >nul && set"`], { encoding: "utf8", windowsHide: true, windowsVerbatimArguments: true });
if (vars.status !== 0) throw new Error("Native Core compiler environment initialization failed.");
const environment = Object.fromEntries(vars.stdout.split(/\r?\n/).filter(line => /^[^=]+=/.test(line)).map(line => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
fs.mkdirSync(output, { recursive: true });
const compiler = path.join(environment.VCToolsInstallDir, "bin/Hostx64/x64/cl.exe");
const compiled = spawnSync(compiler, ["/nologo", "/std:c++20", "/EHsc", "/MT", "/O2", "/W4", "/WX", "/utf-8", "/LD", "/DUNICODE", "/D_UNICODE", "/DNOMINMAX",
  path.join(root, "native/Cap7CE.Core.FileOperations/file_operations.cpp"), `/Fo${path.join(output, "file_operations.obj")}`,
  "/link", `/OUT:${path.join(output, "Cap7CE.Core.FileOperations.Native.dll")}`, "ole32.lib", "shell32.lib", "uuid.lib"], {
  cwd: output, stdio: "inherit", env: environment, windowsHide: true
});
if (compiled.status !== 0) throw new Error("Native Core file operations compilation failed.");
if (process.argv.includes("--test")) {
  const unit = spawnSync(compiler, ["/nologo", "/std:c++20", "/EHsc", "/MT", "/O2", "/W4", "/WX", "/DUNICODE", "/D_UNICODE", "/DNOMINMAX",
    `/I${path.join(root, "native/Cap7CE.Core.FileOperations")}`, path.join(root, "tests/native/file-operation-sink.cpp"),
    `/Fo${path.join(output, "sink-test.obj")}`, `/Fe${path.join(output, "sink-test.exe")}`, "/link", "ole32.lib", "uuid.lib"], { cwd: output, stdio: "inherit", env: environment, windowsHide: true });
  if (unit.status !== 0 || spawnSync(path.join(output, "sink-test.exe"), [], { windowsHide: true }).status !== 0) throw new Error("Native recycle guard failed.");
}
const published = spawnSync("dotnet", ["publish", "core/src/Cap7CE.Core.FileOperations.Host/Cap7CE.Core.FileOperations.Host.csproj",
  "--configuration", "Release", "--runtime", "win-x64", "--self-contained", "true", "--nologo", "--output", output,
  "-p:RestoreLockedMode=true", "-p:DebugType=None", "-p:DebugSymbols=false"], {
  cwd: root, stdio: "inherit", windowsHide: true, env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" }
});
if (published.error) throw published.error;
process.exitCode = published.status ?? 1;
