const fs = require("node:fs"), path = require("node:path");
const directory = "core/src/Cap7CE.Core.FileOperations", host = `${directory}.Host`;
module.exports.register = projects => {
  projects.set(`${directory}/Cap7CE.Core.FileOperations.csproj`, []);
  projects.set(`${host}/Cap7CE.Core.FileOperations.Host.csproj`, [`${directory}/Cap7CE.Core.FileOperations.csproj`]);
  return projects;
};
module.exports.check = (root, failures) => {
  const files = new Map([
    [`${directory}/WindowsFileOperation.cs`, 50], [`${directory}/WindowsFileOperationRules.cs`, 30], [`${host}/Program.cs`, 40],
    ["native/Cap7CE.Core.FileOperations/operation_sink.h", 60], ["native/Cap7CE.Core.FileOperations/file_operations.cpp", 85],
    ["electron/core/coreWindowsFileOperations.ts", 25], ["scripts/core-file-operations-build.cjs", 45]
  ]);
  for (const parent of [directory, host, "native/Cap7CE.Core.FileOperations"])
    for (const name of fs.readdirSync(path.join(root, parent)).filter(name => /\.(?:cs|cpp|h)$/.test(name)))
      if (!files.has(`${parent}/${name}`)) failures.push(`Unregistered Core file operation source: ${parent}/${name}`);
  for (const [name, maximum] of files) {
    const source = fs.readFileSync(path.join(root, name), "utf8");
    if (source.split(/\r?\n/).length > maximum) failures.push(`${name} exceeds file operation ownership (${maximum}).`);
    if (name.startsWith("core/") && /System\.Net|HttpClient|Sqlite|Reader\.Host|DeviceIoControl|Process\.|File\.(?:Delete|Move|Copy)|Directory\.(?:Delete|Move)/.test(source))
      failures.push(`${name} bypasses its native Windows operation boundary.`);
    if (name.startsWith("native/") && /(?:DeleteFile|RemoveDirectory|MoveFile|CopyFile|CreateProcess|ShellExecute|WinHttp|WinInet|DeviceIoControl|FSCTL_)\w*\s*\(/.test(source))
      failures.push(`${name} bypasses the Windows Shell operation contract.`);
  }
  const sink = fs.readFileSync(path.join(root, "native/Cap7CE.Core.FileOperations/operation_sink.h"), "utf8");
  if (!sink.includes("TSF_DELETE_RECYCLE_IF_POSSIBLE") || !sink.includes("? S_OK : E_ABORT")) failures.push("Core deletion must reject permanent fallback before every delete.");
  const rename = fs.readFileSync(path.join(root, "electron/windowsShellRename.ts"), "utf8");
  const trash = fs.readFileSync(path.join(root, "electron/fileOperationService.ts"), "utf8");
  if (/PowerShell|EncodedCommand|child_process|shell\.trashItem/.test(rename + trash) || !rename.includes("requestWindowsFileOperation") || !trash.includes("requestWindowsFileOperation"))
    failures.push("Electron must route both existing physical operations through the Core executor.");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (!pkg.build.extraResources.some(resource => resource.to === "core-file-operations/v1" && JSON.stringify(resource.filter) === JSON.stringify(["Cap7CE.Core.FileOperations.Host.exe", "Cap7CE.Core.FileOperations.Native.dll"])))
    failures.push("Native file operation packaging must contain only the host and backend DLL.");
};
