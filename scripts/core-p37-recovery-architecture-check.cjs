const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const failures = [];
const script = read("scripts/core-p37-recovery-probe.ps1");
const cli = read("core/src/Cap7CE.Core.Host/CoreP37ValidationCli.cs");
const coordination = read("core/src/Cap7CE.Core.Host/CoreP37ProbeCoordination.cs");
const options = read("core/src/Cap7CE.Core.Host/CoreHostOptions.cs");
const hostProject = read("core/src/Cap7CE.Core.Host/Cap7CE.Core.Host.csproj");
const readerProject = read("core/src/Cap7CE.Core.Reader.Host/Cap7CE.Core.Reader.Host.csproj");
const hostConstants = read("core/src/Cap7CE.Core.Reader.Host/ReaderHostConstants.cs");
const clientConstants = read("core/src/Cap7CE.Core.Host/ReaderClientConstants.cs");
const service = read("core/src/Cap7CE.Core.Reader.Host/ReaderVolumeService.cs");
const tests = read("core/tests/Cap7CE.Core.Tests/HostProtocolTests.cs");
const packageJson = JSON.parse(read("package.json"));

for (const [source, anchor, description] of [
  [script, "$driveLetter = 'R'", "fixed disposable drive letter"],
  [script, "New-VHD -Path $vhdPath -Dynamic", "dynamic VHD creation"],
  [script, "Dismount-VHD -Path $vhdPath", "bounded VHD offline and cleanup"],
  [script, "fsutil.exe usn deletejournal", "real Journal replacement"],
  [script, "Stop-Process -Id $service.ProcessId -Force", "real Reader interruption"],
  [script, "currentCatalogChanged = $false", "current Catalog exclusion"],
  [script, "existingVolumesUsed = $false", "existing volume exclusion"],
  [cli, 'private const string DisplayName = "R:"', "fixed client volume"],
  [cli, "CorruptCatalogRejected", "temporary corrupt Catalog rejection"],
  [cli, "RequireStandardClient", "standard-user client"],
  [coordination, 'private const string EnvironmentName = "CAP7CE_P37_PROBE_ROOT"', "process-scoped coordination root"],
  [coordination, 'directory.Name != "client-catalog"', "Catalog cleanup boundary"],
  [options, 'args is ["--core-p37-probe"]', "argument-free activation"],
  [hostProject, "P37RecoveryProfile", "isolated Core endpoint profile"],
  [readerProject, "P37RecoveryProfile", "isolated Reader endpoint profile"],
  [hostConstants, "Cap7CENtfsReaderP37Probe", "isolated Reader service identity"],
  [clientConstants, "cap7ce-ntfs-reader-p37-probe", "isolated Reader client endpoint"],
  [service, "An explicitly authorized volume may be offline", "offline authorized-volume enumeration"],
  [tests, "P3.7 recovery probe must reject free arguments", "closed activation regression"]
]) {
  if (!source.includes(anchor)) failures.push(`P3.7 recovery boundary is missing ${description}.`);
}

if (/--core-p37-probe[^\]]+--/s.test(options)) {
  failures.push("P3.7 recovery CLI accepts an additional free-form argument.");
}
if (/C:\\Users\\|S-1-5-21-|E:\\/i.test(script + cli + coordination)) {
  failures.push("P3.7 recovery probe contains a local identity, SID, or existing volume path.");
}
if (!packageJson.scripts?.["probe:core-p37"]?.includes("core-p37-recovery-probe.ps1")) {
  failures.push("P3.7 recovery probe must remain an explicit npm command.");
}

if (failures.length) {
  console.error("Core P3.7 recovery architecture checks failed:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: "passed", disposableVhd: true, fixedDrive: true, currentCatalogChanged: false,
    existingVolumesUsed: false, readerInterruption: true, journalReplacement: true,
    corruptCatalogRejected: true, cleanupRequired: true
  }));
}
