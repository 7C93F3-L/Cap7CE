// Exercise the real Unicode pipe with a GUI apphost; no runtime or service is installed.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const project = path.resolve(__dirname, '..'), tools = require('./native-installer-tools.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap7ce-installer-progress-'));
(async () => { try {
  const compiler = await tools.getMakeNsisPath();
  const run = (exe, args, expected = 0) => {
    const result = spawnSync(exe, args, { cwd: project, windowsHide: true, encoding: 'utf8', timeout: 60000, env: { ...process.env, ...compiler.env } });
    assert.equal(result.status, expected, result.stdout + result.stderr); return result;
  };
  const include = file => `<Compile Include="${path.join(project, file)}" />`;
  fs.writeFileSync(path.join(root, 'Fixture.csproj'), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>WinExe</OutputType><TargetFramework>net10.0</TargetFramework><EnableDefaultCompileItems>false</EnableDefaultCompileItems><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup><ItemGroup><Compile Include="Program.cs" />${[
    'shell/Cap7CE.WinUI/Services/CoreRuntimeProgress.cs', 'shell/Cap7CE.WinUI/Services/InstallerSearchProgress.cs', 'shell/Cap7CE.WinUI/Localization/LanguageCatalog.cs'
  ].map(include).join('')}</ItemGroup></Project>`);
  fs.copyFileSync(path.join(project, 'shell/Cap7CE.WinUI/Localization/messages.json'), path.join(root, 'languages.json'));
  fs.writeFileSync(path.join(root, 'Program.cs'), `using System.Text;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Localization;
var catalog=new LanguageCatalog(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"../languages.json")));
using var writer=new StreamWriter(Console.OpenStandardOutput(),Encoding.Unicode,1024,leaveOpen:true);
var progress=new InstallerSearchProgress(catalog,args[0]=="2052"?"zh-CN":"en-US",writer);
progress.Report(new(CoreRuntimeStage.Checking));progress.Report(new(CoreRuntimeStage.Downloading));
for(var percent=0;percent<=100;percent+=10){progress.Report(new(CoreRuntimeStage.Downloading,percent));await Task.Delay(20);}
foreach(var stage in new[]{CoreRuntimeStage.Verifying,CoreRuntimeStage.Installing,CoreRuntimeStage.Configuring,CoreRuntimeStage.Completed})progress.Report(new(stage));
return int.Parse(args[1]);`);
  run('dotnet', ['build', path.join(root, 'Fixture.csproj'), '-c', 'Release', '-o', path.join(root, 'bin'), '--nologo']);
  const helper = path.join(root, 'bin/Fixture.exe'), binary = fs.readFileSync(helper), optional = binary.readUInt32LE(0x3c) + 24;
  assert.equal(binary.readUInt16LE(optional + 68), 2, 'fixture must use the same GUI subsystem as the product');
  for (const [language, code] of [[1033, 0], [2052, 0], [2052, 3010]]) {
    const output = path.join(root, `${language}-${code}.txt`), installer = path.join(root, `${language}-${code}.exe`), script = installer + '.nsi';
    fs.writeFileSync(script, `Unicode true
RequestExecutionLevel user
SilentInstall silent
OutFile "${installer}"
Section
 nsExec::ExecToStack '"${helper}" ${language} ${code}'
 Pop $0
 Pop $1
 FileOpen $2 "${output}" w
 FileWriteUTF16LE $2 "$1"
 FileClose $2
 SetErrorLevel $0
SectionEnd
`);
    run(compiler.path, ['/WX', '/V2', '/INPUTCHARSET', 'UTF8', script]); run(installer, ['/S'], code);
    const text = fs.readFileSync(output).toString('utf16le').replaceAll('\uFEFF', '');
    for (const percent of [0, 40, 100]) assert(text.includes(language === 2052 ? `正在下载 .NET 运行时：${percent}%` : `Downloading .NET runtime: ${percent}%`));
    assert(text.includes(language === 2052 ? '搜索服务配置完成。' : 'Search service configuration complete.'));
  }
  console.log('NSIS progress pipe passed: actual WinExe stdout, English/Chinese text, percent milestones, stage completion and restart exit code. Fixtures only.');
} finally {
  assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert(path.basename(root).startsWith('cap7ce-installer-progress-'));
  fs.rmSync(root, { recursive: true, force: true });
} })().catch(error => { console.error(error); process.exitCode = 1; });
