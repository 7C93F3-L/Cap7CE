const fs = require("node:fs"), path = require("node:path");
const directory = "core/src/Cap7CE.Core.FileOperations", host = `${directory}.Host`;
module.exports.register = projects => {
  projects.get("core/tests/Cap7CE.Core.Tests/Cap7CE.Core.Tests.csproj").push(`${directory}/Cap7CE.Core.FileOperations.csproj`);
  projects.set(`${directory}/Cap7CE.Core.FileOperations.csproj`, ["core/src/Cap7CE.Core.Configuration/Cap7CE.Core.Configuration.csproj"]);
  projects.set(`${host}/Cap7CE.Core.FileOperations.Host.csproj`, [`${directory}/Cap7CE.Core.FileOperations.csproj`]);
  return projects;
};
module.exports.ownsStorage = name => ["WindowsItemRename.cs", "WindowsDirectorySource.cs", "FolderRenameJournal.cs", "TrashSourceMetadata.cs"].some(file => name === `${directory}/${file}`);
module.exports.check = (root, failures) => {
  const files = new Map([
    [`${directory}/WindowsItemRename.cs`,45],[`${host}/ItemRenameRequest.cs`,25],["native/Cap7CE.Core.FileOperations/rename_items.h",75],
    [`${directory}/WindowsFileOperation.cs`, 50], [`${directory}/WindowsFileOperationRules.cs`, 30], [`${host}/Program.cs`, 40],
    [`${directory}/WindowsDirectorySource.cs`, 55], [`${directory}/FolderRenameJournal.cs`, 65], [`${directory}/FolderRenameWorkflow.cs`, 80],
    [`${host}/FolderRenameRequestHandler.cs`, 45], [`${host}/WindowsOperationRequest.cs`, 25],
    [`${directory}/TrashModels.cs`, 15], [`${directory}/TrashPathRules.cs`, 35], [`${directory}/TrashSourceMetadata.cs`, 30], [`${directory}/TrashBatchExecutor.cs`, 70],
    [`${host}/TrashSession.cs`, 65], [`${host}/TrashSessionRequest.cs`, 40],
    ["native/Cap7CE.Core.FileOperations/operation_sink.h", 60], ["native/Cap7CE.Core.FileOperations/file_operations.cpp", 85], ["scripts/core-file-operations-build.cjs", 45]
  ]);
  for (const parent of [directory, host, "native/Cap7CE.Core.FileOperations"])
    for (const name of fs.readdirSync(path.join(root, parent)).filter(name => /\.(?:cs|cpp|h)$/.test(name)))
      if (!files.has(`${parent}/${name}`)) failures.push(`Unregistered Core file operation source: ${parent}/${name}`);
  for (const [name, maximum] of files) {
    const source = fs.readFileSync(path.join(root, name), "utf8");
    const inspected = name === `${host}/TrashSession.cs` ? source.replace("Process.GetProcessById(parentPid)", "") : source;
    if (source.split(/\r?\n/).length > maximum) failures.push(`${name} exceeds file operation ownership (${maximum}).`);
    if (name.startsWith("core/") && /System\.Net|HttpClient|Sqlite|Reader\.Host|DeviceIoControl|Process\.|File\.Copy|Directory\.(?:Delete|Move)/.test(inspected))
      failures.push(`${name} bypasses its native Windows operation boundary.`);
    if (name.startsWith("core/") && /File\.(?:Delete|Move)/.test(source) && !name.endsWith("/FolderRenameJournal.cs")) failures.push(`${name} may only mutate assets through IFileOperation.`);
    if (name.startsWith("native/") && /(?:DeleteFile|RemoveDirectory|MoveFile|CopyFile|CreateProcess|ShellExecute|WinHttp|WinInet|DeviceIoControl|FSCTL_)\w*\s*\(/.test(source))
      failures.push(`${name} bypasses the Windows Shell operation contract.`);
  }
  const sink = fs.readFileSync(path.join(root, "native/Cap7CE.Core.FileOperations/operation_sink.h"), "utf8");
  if (!sink.includes("TSF_DELETE_RECYCLE_IF_POSSIBLE") || !sink.includes("? S_OK : E_ABORT")) failures.push("Core deletion must reject permanent fallback before every delete.");
  const session = fs.readFileSync(path.join(root, `${host}/TrashSession.cs`), "utf8");
  for (const anchor of ["24 * 1024 * 1024", "parent.Exited", "Environment.Exit(0)", "request.RequestId <= sequence", "ReadExactlyAsync"])
    if (!session.includes(anchor)) failures.push(`Trash owner lifetime/framing is missing ${anchor}.`);
  const commands = fs.readFileSync(path.join(root, "shell/Cap7CE.WinUI/Services/FileCommands.cs"), "utf8");
  const rename = fs.readFileSync(path.join(root, "shell/Cap7CE.WinUI/Services/ItemRenameService.cs"), "utf8");
  if (/File\.(?:Delete|Move|Copy)|Directory\.(?:Delete|Move)|PowerShell|EncodedCommand/.test(commands + rename))
    failures.push("Native file commands must use the Core executor, not mutate assets directly.");
  if (!rename.includes("NativeCoreRequest.SendAsync")) failures.push("Native rename must use the Core executor.");
  if (!fs.readFileSync(path.join(root, "scripts/native-pack.cjs"), "utf8").includes("core/artifacts/file-operations-host"))
    failures.push("Native file operation package must include its owned host.");
};
