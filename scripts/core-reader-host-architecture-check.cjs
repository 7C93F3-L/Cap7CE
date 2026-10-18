const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const failures = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const hostRoot = path.join(root, "core/src/Cap7CE.Core.Reader.Host");
const expectedHostFiles = [
  "Cap7CE.Core.Reader.Host.csproj", "packages.lock.json", "Program.cs", "DirectoryEntries",
  "ReaderFixtureService.cs", "ReaderHostAssembly.cs", "ReaderHostConstants.cs",
  "ReaderNativePipe.cs", "ReaderNtfsVolume.cs", "ReaderJournalWaitIo.cs", "ReaderProbeResult.cs", "ReaderServiceConfig.cs",
  "ReaderJournalWaitCoordinator.cs", "ReaderJournalWaitChannel.cs", "ReaderVolumeService.cs", "ReaderWindowsService.cs"
];
const actualHostFiles = fs.readdirSync(hostRoot).filter((name) => !name.startsWith(".")).sort();
if (JSON.stringify(actualHostFiles) !== JSON.stringify([...expectedHostFiles].sort())) {
  failures.push(`Reader Host has unexpected files: ${actualHostFiles.join(", ")}.`);
}

const hostSources = actualHostFiles.filter((name) => name.endsWith(".cs"))
  .map((name) => [name, fs.readFileSync(path.join(hostRoot, name), "utf8")])
  .concat(fs.readdirSync(path.join(hostRoot, "DirectoryEntries")).map(name => [`DirectoryEntries/${name}`, read(`core/src/Cap7CE.Core.Reader.Host/DirectoryEntries/${name}`)]));
const hostCombined = hostSources.map(([, source]) => source).join("\n"); require("./core-reader-journal-wait-boundary-check.cjs")(root, failures);
for (const [pattern, capability] of [
  [/System\.Net|HttpClient|Socket\b/, "network API"],
  [/Microsoft\.Data\.Sqlite|System\.Data\.SQLite/, "catalog access"],
  [/Process\.Start|powershell(?:\.exe)?|cmd\.exe/i, "process or command launch"],
  [/FileMode\.(?:Create|Append|Truncate)|File\.Delete|Directory\.Delete/, "general file mutation"]
]) {
  if (pattern.test(hostCombined)) failures.push(`Reader Host introduces ${capability}.`);
}

for (const [name, source] of hostSources) {
  if (/File\.Read|File\.Open|new FileStream/.test(source) && name !== "ReaderServiceConfig.cs") {
    failures.push(`${name} reads files outside the protected config boundary.`);
  }
  if (/File\.Write|File\.Move/.test(source) && name !== "ReaderProbeResult.cs") {
    failures.push(`${name} writes files outside the atomic probe-result boundary.`);
  }
}

const protocol = read("core/src/Cap7CE.Core.Reader.Protocol/ReaderPayloadCodec.cs");
const fixture = read("core/src/Cap7CE.Core.Reader.Host/ReaderFixtureService.cs");
const pipe = read("core/src/Cap7CE.Core.Reader.Host/ReaderNativePipe.cs");
const service = read("core/src/Cap7CE.Core.Reader.Host/ReaderWindowsService.cs");
const client = read("core/src/Cap7CE.Core.Host/ReaderServiceClient.cs");
const nativeClient = read("core/src/Cap7CE.Core.Host/ReaderNativeClient.cs");
const identity = read("core/src/Cap7CE.Core.Host/ReaderServiceIdentity.cs");
const cli = read("core/src/Cap7CE.Core.Host/ReaderFixtureCli.cs");
const lifecycle = read("scripts/core-reader-p21-service-probe.ps1");
for (const [source, anchor, description] of [
  [protocol, "DecodeJournalReadBatchResponse", "fixed operation payload codec"],
  [pipe, "0x00120083", "narrow client rights"],
  [pipe, "PipeRejectRemoteClients", "remote-client rejection"],
  [pipe, "FileFlagFirstPipeInstance", "first pipe instance guard"],
  [fixture, "GetClientProcessId", "native client PID binding"],
  [fixture, "RunAsClient", "client token authentication"],
  [fixture, "IsTokenRestricted", "restricted service token check"],
  [service, "StartServiceCtrlDispatcher", "native Windows service host"],
  [client, "RandomNumberGenerator.GetBytes", "fresh hello nonce"],
  [nativeClient, "GetNamedPipeServerProcessId", "native server PID binding"],
  [identity, "ServiceSidTypeRestricted", "client-side restricted SID check"],
  [identity, "SeChangeNotifyPrivilege", "client-side privilege allowlist"],
  [cli, "reader-client-must-be-standard", "standard-client enforcement"],
  [lifecycle, "start=', 'demand", "manual service start"],
  [lifecycle, "sidtype', $serviceName, 'restricted", "restricted service SID registration"],
  [lifecycle, "privs', $serviceName, 'SeChangeNotifyPrivilege", "minimal service privileges"],
  [lifecycle, "cleanupOk", "verified temporary cleanup"]
]) {
  if (!source.includes(anchor)) failures.push(`P2.1 is missing ${description}.`);
}

const hostConstants = read("core/src/Cap7CE.Core.Reader.Host/ReaderHostConstants.cs");
const clientConstants = read("core/src/Cap7CE.Core.Host/ReaderClientConstants.cs");
for (const value of [
  "Cap7CECoreReaderP21Probe", "cap7ce-core-reader-p21-probe",
  "Cap7CENtfsReaderP23Probe", "cap7ce-ntfs-reader-p23-probe"
]) {
  if (!hostConstants.includes(value) || !clientConstants.includes(value)) {
    failures.push(`Reader endpoint mismatch for ${value}.`);
  }
}
for (const source of [hostCombined, client, identity, cli, lifecycle]) {
  if (/C:\\Users\\|E:\\|S-1-5-21-|fixture-01\.(?!png)/i.test(source)) {
    failures.push("P2.1 source contains a local identity or real source path.");
  }
}

if (failures.length) {
  console.error("Core Reader Host architecture checks failed:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: "passed", readerHost: "restricted-service", pipeDacl: "explicit-narrow",
    remoteClientsRejected: true, mutualProcessIdentity: true, serviceStart: "manual",
    restrictedServiceSid: true, electronConnected: false
  }));
}
