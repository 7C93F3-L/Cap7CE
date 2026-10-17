const fs = require("node:fs");
const path = require("node:path");

module.exports = (root, sourceFiles, failures) => {
  for (const [file, maximum] of [["electron/metadataDirectoryBuildStore.ts", 65],
    ["electron/metadataExtraction/metadataDirectoryBuildRuntime.ts", 140], ["electron/metadataExtraction/metadataDirectoryScope.ts", 35]]) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    if (text.split(/\r?\n/).length > maximum) failures.push(`${file} exceeds its metadata task boundary.`);
    if (/CoreHostController|sql\.js|databaseService|thumbnailOptimizationService/.test(text)) failures.push(`${file} bypasses the metadata task owner.`);
  }
  const panel = fs.readFileSync(path.join(root, "src/renderer/metadata-build/MetadataBuildPanel.tsx"), "utf8");
  if (/window\.|electron|node:|fetch\(|useEffect|useState|setInterval/.test(panel) || panel.split(/\r?\n/).length > 100) {
    failures.push("Metadata build panel must remain a bounded presentation component without runtime ownership.");
  }
  if (!panel.includes('from "../../shared/metadataBuildTypes"')) failures.push("Metadata build panel must use the shared progress contract.");
  const recovery = fs.readFileSync(path.join(root, "core/src/Cap7CE.Core.Host/MetadataRecovery/FileFactRecoveryCheckpoint.cs"), "utf8");
  if (/System\.Net|HttpClient|DeviceIoControl|AdjustTokenPrivileges|File\.(?:Copy|Replace)|Directory\.(?:Delete|Move)|sqlite3_exec|\b(?:INSERT|UPDATE|DROP|ALTER)\s+(?:INTO|TABLE|file_)/.test(recovery)) {
    failures.push("Metadata recovery bypasses its private backup-only boundary.");
  }
  for (const anchor of ["DataSource = sourcePath, Mode = SqliteOpenMode.ReadOnly", "FileMode.CreateNew",
    "sqlite3_backup_step(backup, 256)", "token.ThrowIfCancellationRequested()", "File.Move(partial, output)", "if (reserved) File.Delete(partial)"]) {
    if (!recovery.includes(anchor)) failures.push(`Metadata recovery is missing ${anchor}.`);
  }
  const workerRoot = path.join(root, "electron", "metadataExtraction");
  const nativeMedia = fs.readFileSync(path.join(root, "native/Cap7CE.Media.Metadata/Program.cs"), "utf8");
  if (nativeMedia.split(/\r?\n/).length > 120 || /System\.Net|HttpClient|ShellExecute|AdjustTokenPrivileges|File\.(?:Write|Delete|Move)|Directory\.(?:Create|Delete|Move)|RenderToFileAsync/.test(nativeMedia)) {
    failures.push("Native media metadata helper must remain a bounded ordinary process without source writes, disk discovery or cache production.");
  }
  for (const anchor of ["--parent-pid", "parent.WaitForExitAsync()", "jobs < 16", "256 * 1024", "TimeSpan.FromSeconds(9)",
    "FileAttributes.ReparsePoint", "0x440000", "0.1, 0.5, 0.9", "VideoFramePrecision.NearestFrame", "decoder.PixelWidth is < 1 or > 160",
    "192 * 1024 * 1024", "UnmappedMemberHandling.Disallow"]) {
    if (!nativeMedia.includes(anchor)) failures.push(`Native media metadata helper is missing ${anchor}.`);
  }
  for (const [name, maximum] of [["videoMetadataFrameClient.ts", 110], ["videoMetadataFrames.ts", 60]]) {
    if (fs.readFileSync(path.join(workerRoot, name), "utf8").split(/\r?\n/).length > maximum)
      failures.push(`Video metadata module ${name} exceeds its bounded responsibility.`);
  }
  for (const name of fs.readdirSync(workerRoot).filter((name) => name.endsWith(".ts"))) {
    const source = fs.readFileSync(path.join(workerRoot, name), "utf8");
    if (/node:(?:net|http|https|tls|dgram)|fetch\(|sqlite|thumbnail|fs\.(?:write|append|unlink|rename|rm|mkdir)/i.test(source)) {
      failures.push(`Metadata worker ${name} bypasses its local content-read boundary.`);
    }
  }
  const workerClient = fs.readFileSync(path.join(workerRoot, "metadataWorkerClient.ts"), "utf8");
  const archiveReader = fs.readFileSync(path.join(workerRoot, "archiveMetadataReader.ts"), "utf8");
  for (const anchor of ["restrictArchiveSourceFilesystem(module, filePath)", "boundWasmMemory(bytes, 256 * 1024 * 1024)",
    'module.callMain(["l", "-slt"', 'virtualFilesystem.mkdir("/source")']) {
    if (!archiveReader.includes(anchor)) failures.push(`Archive metadata reader is missing ${anchor}.`);
  }
  const workerProcess = fs.readFileSync(path.join(workerRoot, "metadataWorkerProcess.ts"), "utf8");
  for (const anchor of ["--max-old-space-size=256", "windowsHide: true", "this.retiring.size > 0"]) {
    if (!workerClient.includes(anchor)) failures.push(`Metadata worker client is missing ${anchor}.`);
  }
  for (const anchor of ["sharp.concurrency(1)", "sharp.cache(false)", 'process.on("disconnect", stop)']) {
    if (!workerProcess.includes(anchor)) failures.push(`Metadata worker process is missing ${anchor}.`);
  }
  for (const filePath of sourceFiles.filter((file) => file.replaceAll("\\", "/").includes("/FileFacts/"))) {
    const source = fs.readFileSync(filePath, "utf8");
    if (/System\.Net|HttpClient|Process\.|File\.|Directory\.|FileStream|Reader\.Host|DeviceIoControl/.test(source)) {
      failures.push(`${path.relative(root, filePath)} bypasses the fact-store database-only boundary.`);
    }
  }
  for (const filePath of sourceFiles.filter((file) => file.replaceAll("\\", "/").includes("/MetadataExtraction/"))) {
    const source = fs.readFileSync(filePath, "utf8");
    if (/System\.Net|HttpClient|DeviceIoControl|AdjustTokenPrivileges|ShellExecute|Process\.|File\.(?:Write|Delete|Move)|Directory\.(?:Delete|Move)|WriteFile|DeleteFile|SetFileInformation/.test(source)) {
      failures.push(`${path.relative(root, filePath)} bypasses the ordinary read-only extraction boundary.`);
    }
    if (filePath.endsWith("NativeFileFactSourceGuard.cs")) {
      for (const anchor of ["ReadAttributes = 0x80", "OpenExisting = 3", "OpenReparsePoint = 0x00200000",
        "actualId.Serial != rootId.Serial", "BlockedAttributes = 0x00441410", "GetDriveTypeW(root) is not (2 or 3)"]) {
        if (!source.includes(anchor)) failures.push(`Native source guard is missing ${anchor}.`);
      }
    }
  }
};
