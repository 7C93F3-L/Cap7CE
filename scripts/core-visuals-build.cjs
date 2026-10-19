const fs = require("node:fs"), path = require("node:path"), { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, ".."), output = path.join(root, "native/artifacts/core-visuals/v1");
const tools = path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft Visual Studio/Installer/vswhere.exe");
const locate = spawnSync(tools, ["-latest", "-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath"], { encoding: "utf8", windowsHide: true });
if (locate.status !== 0 || !locate.stdout.trim()) throw new Error("Core visual adapter requires the installed x64 C++ build tools.");
const setup = path.join(locate.stdout.trim(), "VC/Auxiliary/Build/vcvars64.bat");
const vars = spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `""${setup}" >nul && set"`], { encoding: "utf8", windowsHide: true, windowsVerbatimArguments: true });
if (vars.status !== 0) throw new Error("Core visual compiler environment initialization failed.");
const environment = Object.fromEntries(vars.stdout.split(/\r?\n/).filter(line => /^[^=]+=/.test(line)).map(line => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
require("./core-visuals-safety.cjs").assertStopped(output);
fs.mkdirSync(output, { recursive: true });
const compiler = path.join(environment.VCToolsInstallDir, "bin/Hostx64/x64/cl.exe");
const result = spawnSync(compiler, ["/nologo", "/std:c++20", "/EHsc", "/MT", "/O2", "/W4", "/WX", "/utf-8", "/DUNICODE", "/D_UNICODE", "/DNOMINMAX", "/D_WIN32_WINNT=0x0A00",
  ...["main.cpp", "job_runner.cpp", "job_control.cpp", "scratch.cpp", "thumbnail.cpp", "icon_pixels.cpp"].map(file => path.join(root, "native/Cap7CE.Core.Visuals", file)),
  `/Fo${output}${path.sep}`, `/Fe${path.join(output, "Cap7CE.Core.Visuals.exe")}`, "/link", "ole32.lib", "shell32.lib", "windowscodecs.lib", "uuid.lib", "gdi32.lib", "user32.lib",
  "/MANIFEST:EMBED", "/MANIFESTUAC:level='asInvoker' uiAccess='false'"], { cwd: output, stdio: "inherit", env: environment, windowsHide: true });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error("Core visual adapter compilation failed.");
