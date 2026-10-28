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
const version = require('../package.json').version.split('.').map(Number);
if(version.length!==3||version.some(value=>!Number.isInteger(value)||value<0||value>65535))throw new Error('Invalid native resource version.');
const resource=path.join(output,'resources.res');
fs.writeFileSync(path.join(output,'resource-version.h'),`#define CAP_VERSION_TEXT "${version.join('.')}"\n`);
const resourceResult=spawnSync('rc.exe',['/nologo','/I',path.join(root,'build'),'/I',output,...['MAJOR','MINOR','PATCH'].map((part,index)=>`/dCAP_VERSION_${part}=${version[index]}`),'/fo',resource,path.join(root,'native/Cap7CE.Core.Visuals/resources.rc')],{cwd:output,stdio:'inherit',env:environment,windowsHide:true});
if(resourceResult.error||resourceResult.status!==0)throw resourceResult.error||new Error('Core visual resource compilation failed.');
const result = spawnSync(compiler, ["/nologo", "/std:c++20", "/EHsc", "/MT", "/O2", "/W4", "/WX", "/utf-8", "/DUNICODE", "/D_UNICODE", "/DNOMINMAX", "/D_WIN32_WINNT=0x0A00",
  ...["main.cpp", "job_runner.cpp", "job_control.cpp", "scratch.cpp", "thumbnail.cpp", "icon_pixels.cpp"].map(file => path.join(root, "native/Cap7CE.Core.Visuals", file)),
  `/Fo${output}${path.sep}`, `/Fe${path.join(output, "Cap7CE.Core.Visuals.exe")}`, "/link", "ole32.lib", "shell32.lib", "windowscodecs.lib", "uuid.lib", "gdi32.lib", "user32.lib",
  resource, "/MANIFEST:EMBED", "/MANIFESTUAC:level='asInvoker' uiAccess='false'"], { cwd: output, stdio: "inherit", env: environment, windowsHide: true });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error("Core visual adapter compilation failed.");
const executable=path.join(output,'Cap7CE.Core.Visuals.exe');
const metadataCheck=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',
  "$info=[Diagnostics.FileVersionInfo]::GetVersionInfo($env:CAP_VISUAL_EXE); if($info.FileDescription -ne 'Cap7CE Background Worker' -or $info.ProductName -ne 'Cap7CE' -or $info.FileVersion -ne $env:CAP_VISUAL_VERSION){exit 1}"],
  {windowsHide:true,env:{...environment,CAP_VISUAL_EXE:executable,CAP_VISUAL_VERSION:version.join('.')}});
if(metadataCheck.error||metadataCheck.status!==0)throw metadataCheck.error||new Error('Core visual executable metadata validation failed.');
