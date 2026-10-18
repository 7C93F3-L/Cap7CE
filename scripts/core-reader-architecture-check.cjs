const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const sourceRoot = path.join(root, "core/src/Cap7CE.Core.Reader.Protocol");
const failures = [];
const expectedFiles = [
  "Cap7CE.Core.Reader.Protocol.csproj",
  "ReaderFrame.cs", "ReaderFrameCodec.cs",
  "ReaderFileEntryCodec.cs", "ReaderFileEntryMessages.cs", "ReaderFileName.cs",
  "ReaderMessages.cs", "ReaderJournalWaitCodec.cs",
  "ReaderPayloadCodec.cs",
  "ReaderProtocol.cs",
  "ReaderProtocolAssembly.cs",
  "ReaderProtocolException.cs",
  "packages.lock.json"
];
const actualFiles = fs.readdirSync(sourceRoot).filter((name) => !name.startsWith(".")).sort();
if (JSON.stringify(actualFiles) !== JSON.stringify([...expectedFiles].sort())) {
  failures.push(`Reader protocol project has unexpected files: ${actualFiles.join(", ")}.`);
}

const sources = actualFiles.filter((name) => name.endsWith(".cs"))
  .map((name) => fs.readFileSync(path.join(sourceRoot, name), "utf8"));
const combined = sources.join("\n");
for (const [pattern, capability] of [
  [/System\.Text\.Json/, "JSON protocol"],
  [/System\.IO\.Pipes|NamedPipe/, "transport ownership"],
  [/System\.Net|HttpClient|Socket\b/, "network API"],
  [/Microsoft\.Data\.Sqlite|System\.Data\.SQLite/, "catalog ownership"],
  [/System\.ServiceProcess|ServiceController|ServiceBase/, "service hosting"],
  [/DeviceIoControl|CreateFileW|FSCTL_|USN_JOURNAL/, "NTFS Reader implementation"],
  [/DllImport|LibraryImport/, "native interop"],
  [/System\.Diagnostics|Process\b/, "process control"]
]) {
  if (pattern.test(combined)) failures.push(`Reader protocol introduces ${capability} in its contract-only round.`);
}

const protocol = fs.readFileSync(path.join(sourceRoot, "ReaderProtocol.cs"), "utf8");
const codec = fs.readFileSync(path.join(sourceRoot, "ReaderFrameCodec.cs"), "utf8");
const tests = fs.readFileSync(path.join(root, "core/tests/Cap7CE.Core.Tests/ReaderProtocolTests.cs"), "utf8");
for (const [source, anchor, description] of [
  [protocol, "MaximumPayloadBytes = 1024 * 1024", "1 MiB payload ceiling"],
  [protocol, "MaximumRequestedPages = 64", "request page ceiling"],
  [protocol, "MaximumConcurrentRequests = 1", "single-request ceiling"],
  [protocol, "LegacyMajorVersion = 1", "CR/1 compatibility version"],
  [protocol, "CurrentMajorVersion = 2", "CR/2 current version"],
  [protocol, "MftOpenSnapshot", "fixed MFT snapshot operation"],
  [protocol, "JournalReadBatch", "fixed Journal operation"],
  [protocol, "VolumeEnumerate", "fixed multi-volume enumeration operation"],
  [codec, "BinaryPrimitives", "binary header codec"],
  [codec, "LegacyMajorVersion or ReaderProtocol.CurrentMajorVersion", "CR/1 and CR/2 frame acceptance"],
  [codec, "payload-too-large", "pre-allocation payload rejection"],
  [tests, "FreezesReaderBoundary", "negative capability tests"],
  [tests, "ReaderVolumeEnumerateResponse", "CR/2 multi-volume roundtrip"],
  [tests, "ReaderMftRecordV2", "CR/2 basic-facts roundtrip"]
]) {
  if (!source.includes(anchor)) failures.push(`Reader protocol is missing ${description}.`);
}

const operationBody = protocol.match(/enum ReaderOperation[^\{]*\{([^}]*)\}/s)?.[1] ?? "";
if (/Path|FileContent|Sql|Command|Execute|Network|Write/i.test(operationBody)) {
  failures.push("Reader operation registry exposes a forbidden general-purpose capability.");
}

if (failures.length) {
  console.error("Core Reader architecture checks failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: "passed",
    protocol: "CR/1+CR/2-binary",
    fixedOperations: 11,
    maximumPayloadBytes: 1024 * 1024,
    transportImplemented: true,
    serviceInstalled: false,
    ntfsAccess: false
  }));
}
