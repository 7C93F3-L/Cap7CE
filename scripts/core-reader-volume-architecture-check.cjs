const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const failures = [];
const ntfs = read("core/src/Cap7CE.Core.Reader.Host/ReaderNtfsVolume.cs"), service = read("core/src/Cap7CE.Core.Reader.Host/ReaderVolumeService.cs");
const config = read("core/src/Cap7CE.Core.Reader.Host/ReaderServiceConfig.cs"), cli = read("core/src/Cap7CE.Core.Host/ReaderVolumeCli.cs");
const options = read("core/src/Cap7CE.Core.Host/CoreHostOptions.cs"), lifecycle = read("scripts/core-reader-p22-volume-probe.ps1");
const p31Probe = read("scripts/core-p31-real-probe.ps1"), p31Cli = read("core/src/Cap7CE.Core.Host/CoreP31ValidationCli.cs");
const synchronization = read("core/src/Cap7CE.Core.Host/CatalogSynchronizationService.cs");
for (const anchor of [
  "0x000900B3", "0x000900F4", "0x000900BB", "FileReadData", "reader-volume-not-ntfs",
  "GetVolumeInformation", "GetFileInformationByHandleEx", "OpenFileById", "FileReadAttributes",
  "public long FileIdHigh;"
]) {
  if (!ntfs.includes(anchor)) failures.push(`P2.2 read-only NTFS adapter is missing ${anchor}.`);
}
for (const [pattern, description] of [
  [/GenericWrite|FileWriteData|\bWriteFile\b|DeleteFile|MoveFile|CreateDirectory/, "source-volume mutation API"],
  [/System\.Net|HttpClient|Socket\b/, "network API"],
  [/Microsoft\.Data\.Sqlite|System\.Data\.SQLite/, "catalog ownership"]
]) {
  if (pattern.test(ntfs + service)) failures.push(`P2.2 Reader introduces ${description}.`);
}
for (const [source, anchor, description] of [
  [config, 'Phase is not ("fixture" or "disconnect" or "stop" or "volume")', "closed phase allowlist"],
  [config, "reader-volume-letter", "single-letter volume validation"],
  [config, "AuthorizedVolumeLetters", "explicit multi-volume allowlist"],
  [service, "ReaderCapabilities.SnapshotPaging | ReaderCapabilities.JournalPaging", "real capability handshake"],
  [service, "ReaderCapabilities.MultiVolume | ReaderCapabilities.BasicFacts", "CR/2 capability handshake"],
  [service, "ReaderStatus.JournalDiscontinuous", "structured discontinuity"],
  [service, "snapshot?.Dispose()", "snapshot cancellation cleanup"],
  [cli, "BeginRebuildAsync", "catalog rebuild recovery"],
  [cli, "CatalogVolumeState.CatchingUp", "incremental catch-up"],
  [cli, "Directory.Delete(root, recursive: true)", "temporary catalog cleanup"],
  [cli, "SourceVolumeWritten", "no-write aggregate report"],
  [options, "--reader-volume-probe", "explicit parameter-free activation"],
  [lifecycle, "volumeLetter = 'E'", "explicit authorized probe volume"],
  [lifecycle, "start=', 'demand", "manual service start"],
  [lifecycle, "cleanupOk", "service and directory cleanup"],
  [p31Cli, "const string driveRoot = \"E:\\\\\"", "fixed authorized P3.1 validation volume"],
  [p31Cli, "ControlledFixtureCleanupOk", "controlled fixture cleanup result"],
  [synchronization, "CatalogReaderDiscontinuityException", "product discontinuity recovery"],
  [p31Probe, "volumeLetters = @('E')", "protected CR/2 volume allowlist"],
  [p31Probe, "--core-p31-probe", "standard-user product validation client"],
  [p31Probe, "--core-p31-initial-probe", "bounded initial-build validation client"]
]) {
  if (!source.includes(anchor)) failures.push(`Core Reader volume boundary is missing ${description}.`);
}
if (/--reader-volume-probe[^\]]+--/s.test(options)) {
  failures.push("P2.2 volume CLI accepts an additional free-form argument.");
}
for (const source of [ntfs, service, cli, lifecycle]) {
  if (/C:\\Users\\|E:\\|S-1-5-21-/i.test(source)) {
    failures.push("P2.2 source contains a local identity, SID, or real file path.");
  }
}
if (failures.length) {
  console.error("Core Reader volume architecture checks failed:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: "passed", adapter: "read-only-ntfs-cr2-multi-volume", initialBuild: true, incremental: true,
    cancellation: true, discontinuityRecovery: true, sourceFileContents: false, sourceVolumeWrite: false,
    network: false, temporaryCatalogCleanup: true, electronConnected: false
  }));
}
