const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, ".."), coreRoot = path.join(root, "core");
const failures = [];
const normalize = (value) => value.replaceAll("\\", "/");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const expectedProjects = new Map([
  ["core/src/Cap7CE.Core.Protocol/Cap7CE.Core.Protocol.csproj", []], ["core/src/Cap7CE.Core.Reader.Protocol/Cap7CE.Core.Reader.Protocol.csproj", []],
  ["core/src/Cap7CE.Core.Reader.Host/Cap7CE.Core.Reader.Host.csproj", ["core/src/Cap7CE.Core.Reader.Protocol/Cap7CE.Core.Reader.Protocol.csproj"]],
  ["core/src/Cap7CE.Core.Catalog/Cap7CE.Core.Catalog.csproj", []],
  ["core/src/Cap7CE.Core.Adapters.Abstractions/Cap7CE.Core.Adapters.Abstractions.csproj", []],
  ["core/src/Cap7CE.Core.Setup/Cap7CE.Core.Setup.csproj", []],
  ["core/src/Cap7CE.Core.Host/Cap7CE.Core.Host.csproj", [
    "core/src/Cap7CE.Core.Protocol/Cap7CE.Core.Protocol.csproj", "core/src/Cap7CE.Core.Reader.Protocol/Cap7CE.Core.Reader.Protocol.csproj",
    "core/src/Cap7CE.Core.Catalog/Cap7CE.Core.Catalog.csproj", "core/src/Cap7CE.Core.Adapters.Abstractions/Cap7CE.Core.Adapters.Abstractions.csproj"
  ]],
  ["core/tests/Cap7CE.Core.Tests/Cap7CE.Core.Tests.csproj", [
    "core/src/Cap7CE.Core.Protocol/Cap7CE.Core.Protocol.csproj", "core/src/Cap7CE.Core.Reader.Protocol/Cap7CE.Core.Reader.Protocol.csproj", "core/src/Cap7CE.Core.Reader.Host/Cap7CE.Core.Reader.Host.csproj",
    "core/src/Cap7CE.Core.Catalog/Cap7CE.Core.Catalog.csproj", "core/src/Cap7CE.Core.Adapters.Abstractions/Cap7CE.Core.Adapters.Abstractions.csproj", "core/src/Cap7CE.Core.Host/Cap7CE.Core.Host.csproj",
    "core/src/Cap7CE.Core.Setup/Cap7CE.Core.Setup.csproj"
  ]]
]);
const allowedPackages = new Map([["core/src/Cap7CE.Core.Catalog/Cap7CE.Core.Catalog.csproj", [["Microsoft.Data.Sqlite", "10.0.12"]]]]);
for (const [projectPath, expectedReferences] of expectedProjects) {
  const absoluteProjectPath = path.join(root, projectPath);
  if (!fs.existsSync(absoluteProjectPath)) {
    failures.push(`Missing Core project: ${projectPath}`);
    continue;
  }
  const source = fs.readFileSync(absoluteProjectPath, "utf8");
  const actualPackages = [...source.matchAll(/<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"\s*\/>/g)]
    .map((match) => [match[1], match[2]]);
  const wantedPackages = allowedPackages.get(projectPath) ?? [];
  if (JSON.stringify(actualPackages) !== JSON.stringify(wantedPackages)) {
    failures.push(`${projectPath} has unexpected Core package references.`);
  }
  const actualReferences = [...source.matchAll(/<ProjectReference\s+Include="([^"]+)"\s*\/>/g)]
    .map((match) => normalize(path.relative(root, path.resolve(path.dirname(absoluteProjectPath), match[1]))))
    .sort();
  const wantedReferences = [...expectedReferences].sort();
  if (JSON.stringify(actualReferences) !== JSON.stringify(wantedReferences)) {
    failures.push(`${projectPath} has unexpected project references: ${actualReferences.join(", ") || "none"}.`);
  }
}
const solutionSource = read("core/Cap7CE.Core.sln");
for (const projectPath of expectedProjects.keys()) {
  const solutionPath = normalize(path.relative(coreRoot, path.join(root, projectPath))).replaceAll("/", "\\");
  if (!solutionSource.includes(`"${solutionPath}"`)) failures.push(`Core solution does not include ${projectPath}.`);
}
const propsSource = read("core/Directory.Build.props");
for (const required of [
  "<TargetFramework>net10.0</TargetFramework>", "<Nullable>enable</Nullable>",
  "<TreatWarningsAsErrors>true</TreatWarningsAsErrors>", "<IsPackable>false</IsPackable>", "core/artifacts"
]) {
  const normalizedProps = required === "core/artifacts" ? normalize(propsSource) : propsSource;
  const expected = required === "core/artifacts" ? "artifacts/" : required;
  if (!normalizedProps.includes(expected)) failures.push(`Core shared build properties are missing ${required}.`);
}
const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(entryPath) : [entryPath];
});
const coreSourceFiles = walk(path.join(coreRoot, "src")).filter((filePath) => filePath.endsWith(".cs"));
for (const name of ["core-file-facts-boundary-check", "core-catalog-maintenance-boundary-check", "core-random-browse-boundary-check"]) require(`./${name}.cjs`)(root, coreSourceFiles, failures);
const forbiddenP11Source = [
  [/(?:^|\W)System\.Net(?:\W|$)|HttpClient|Socket\b/, "network API"],
  [/Microsoft\.Data\.Sqlite|System\.Data\.SQLite/, "catalog database implementation"],
  [/System\.ServiceProcess|ServiceController|ServiceBase/, "package-owned Windows service implementation"],
  [/DeviceIoControl|FSCTL_|USN_JOURNAL|ENUM_USN_DATA/, "NTFS Reader implementation"],
  [/Process\.Kill|transaction-open|CatalogCrashWorker/, "test-only crash injection"],
  [/(?<!CatalogEntryType\.)\b(?:File|Directory|DriveInfo|FileInfo|DirectoryInfo|FileStream)\b/, "real file-system access"]
];
for (const filePath of coreSourceFiles) {
  const source = fs.readFileSync(filePath, "utf8");
  const relativePath = normalize(path.relative(root, filePath));
  const isCatalogSource = relativePath.startsWith("core/src/Cap7CE.Core.Catalog/");
  const isReaderHostSource = relativePath.startsWith("core/src/Cap7CE.Core.Reader.Host/");
  const isVolumeProbeSource = relativePath === "core/src/Cap7CE.Core.Host/ReaderVolumeCli.cs";
  const isMetadataRecovery = relativePath === "core/src/Cap7CE.Core.Host/MetadataRecovery/FileFactRecoveryCheckpoint.cs";
  const isProductCoreRuntime = relativePath === "core/src/Cap7CE.Core.Host/ProductCoreRuntime.cs";
  const isControllerProbeCatalog = relativePath === "core/src/Cap7CE.Core.Host/ControllerProbeCatalog.cs";
  const isRealValidationSource = ["CoreP31ValidationCli.cs", "CoreP37ValidationCli.cs", "CoreP37ProbeCoordination.cs"].some(name => relativePath === `core/src/Cap7CE.Core.Host/${name}`);
  const isReaderV2SessionSource = relativePath === "core/src/Cap7CE.Core.Host/ReaderV2CatalogSession.cs";
  const isReaderLifecycleSource = ["core/src/Cap7CE.Core.Host/ReaderLifecycleCli.cs",
    "core/src/Cap7CE.Core.Host/ReaderServiceController.cs"].includes(relativePath);
  const isSetupPayloadVerifier = relativePath === "core/src/Cap7CE.Core.Setup/CapabilitySetupPayloadVerifier.cs";
  const isSetupPeerIdentity = relativePath === "core/src/Cap7CE.Core.Setup/CapabilitySetupPeerIdentity.cs";
  const isSetupWindowsFileBoundary = [
    "core/src/Cap7CE.Core.Setup/CapabilitySetupWindowsBackend.cs",
    "core/src/Cap7CE.Core.Setup/CapabilitySetupWindowsAcl.cs",
    "core/src/Cap7CE.Core.Setup/CapabilitySetupWindowsFileSystem.cs", "core/src/Cap7CE.Core.Setup/CapabilitySetupWindowsCleanup.cs", "core/src/Cap7CE.Core.Setup/CapabilitySetupWindowsVerifier.cs"
  ].includes(relativePath);
  const allowedCapabilities = isCatalogSource ? ["catalog database implementation", "real file-system access"]
    : isReaderHostSource ? ["package-owned Windows service implementation", "NTFS Reader implementation", "real file-system access"]
    : isVolumeProbeSource || isMetadataRecovery ? ["catalog database implementation", "real file-system access"]
    : isProductCoreRuntime || isControllerProbeCatalog ? ["real file-system access"]
    : isRealValidationSource ? ["catalog database implementation", "real file-system access"]
    : isReaderV2SessionSource ? ["package-owned Windows service implementation"]
    : isReaderLifecycleSource ? ["package-owned Windows service implementation"]
    : isSetupPayloadVerifier || isSetupPeerIdentity || isSetupWindowsFileBoundary ? ["real file-system access"] : [];
  const forbiddenSource = forbiddenP11Source.filter(([, capability]) => !allowedCapabilities.includes(capability));
  for (const [pattern, capability] of forbiddenSource) {
    if (pattern.test(source)) {
      failures.push(`${normalize(path.relative(root, filePath))} introduces ${capability} outside its authorized boundary.`);
    }
  }
  if (/System\.IO\.Pipes|NamedPipe(?:Server|Client)Stream/.test(source)
      && !relativePath.startsWith("core/src/Cap7CE.Core.Host/")
      && !relativePath.startsWith("core/src/Cap7CE.Core.Reader.Host/")
      && !["core/src/Cap7CE.Core.Setup/CapabilitySetupActivationPipe.cs",
        "core/src/Cap7CE.Core.Setup/CapabilitySetupPeerIdentity.cs",
        "core/src/Cap7CE.Core.Setup/CapabilitySetupActivationProtocol.cs"].includes(relativePath)) {
    failures.push(`${relativePath} owns pipe transport outside an authorized Host boundary.`);
  }
}
const hostProgram = read("core/src/Cap7CE.Core.Host/Program.cs"), hostOptions = read("core/src/Cap7CE.Core.Host/CoreHostOptions.cs");
const pipeServer = read("core/src/Cap7CE.Core.Host/CorePipeServer.cs"), catalogCli = read("core/src/Cap7CE.Core.Host/CatalogReadOnlyCli.cs");
const catalogDatabase = read("core/src/Cap7CE.Core.Catalog/CatalogDatabase.cs"), catalogRecovery = read("core/src/Cap7CE.Core.Catalog/CatalogDatabaseRecovery.cs");
const catalogV2 = read("core/src/Cap7CE.Core.Catalog/CatalogV2Database.cs");
const catalogV2Snapshot = read("core/src/Cap7CE.Core.Catalog/CatalogV2SnapshotBuild.cs");
const catalogV2Models = read("core/src/Cap7CE.Core.Catalog/CatalogV2Models.cs");
const synchronization = read("core/src/Cap7CE.Core.Host/CatalogSynchronizationService.cs");
const productRuntime = read("core/src/Cap7CE.Core.Host/ProductCoreRuntime.cs");
const coreProtocol = read("core/src/Cap7CE.Core.Protocol/CoreProtocol.cs");
const p31Tests = read("core/tests/Cap7CE.Core.Tests/CatalogV2Tests.cs");
const p31Probe = read("core/src/Cap7CE.Core.Host/CoreP31ValidationCli.cs");
const nativeDependencyProbe = read("core/src/Cap7CE.Core.Catalog/CatalogNativeDependencyProbe.cs");
const crashTests = read("core/tests/Cap7CE.Core.Tests/CatalogCrashWorker.cs"), readOnlyCliTests = read("core/tests/Cap7CE.Core.Tests/CatalogReadOnlyCliTests.cs");
for (const [source, anchor, description] of [
  [hostOptions, "--synthetic-server", "explicit synthetic activation"], [hostOptions, "--catalog-readonly", "explicit read-only CLI activation"],
  [hostOptions, "--catalog-native-dependency-probe", "fixed native SQLite deployment probe activation"],
  [hostOptions, "--catalog-server", "explicit product catalog activation"], [hostOptions, "--core-p31-probe", "explicit P3.1 real-probe activation"],
  [hostOptions, "--catalog-controller-probe", "explicit P3.2 temporary controller-probe activation"],
  [hostOptions, "--core-p31-initial-probe", "bounded P3.1 initial-build probe activation"],
  [hostProgram, "Console.In.ReadLineAsync", "stdin-only session secret"], [pipeServer, "PipeOptions.CurrentUserOnly", "same-user pipe isolation"],
  [catalogCli, "CatalogReadOnlyReport", "aggregate read-only CLI report"], [catalogDatabase, "SqliteOpenMode.ReadOnly", "native catalog read-only mode"],
  [catalogRecovery, "ReconcileVolumeAsync", "catalog continuity reconciliation"], [crashTests, "process.Kill(entireProcessTree: true)", "test-only process termination"],
  [readOnlyCliTests, "must not echo private input", "read-only CLI privacy assertion"],
  [catalogV2Models, "directory-path-cache", "Catalog v2 path strategy"], [catalogV2, "catalog_volumes_v2", "Catalog v2 per-volume state"],
  [catalogV2Snapshot, "PRAGMA journal_mode = OFF", "disposable P3.1 bulk-build staging database"],
  [synchronization, "CatalogReaderDiscontinuityException", "P3.1 discontinuity recovery"], [synchronization, "BeginCatchUpAsync", "P3.1 incremental catch-up"],
  [productRuntime, "DefaultCatalogPath", "per-user product catalog location"], [coreProtocol, "P31Capabilities", "SC/1 P3.1 operation allowlist"],
  [p31Tests, "RunsMultiVolumeVerticalSliceAsync", "multi-volume product vertical slice"], [p31Probe, "RequireStandardClient", "standard-user real probe"],
  [nativeDependencyProbe, "Data Source=:memory:", "in-memory native SQLite deployment probe"]
]) {
  if (!source.includes(anchor)) failures.push(`Core is missing ${description}.`);
}
const nugetConfig = read("core/NuGet.Config");
for (const anchor of ["<clear />", "https://api.nuget.org/v3/index.json", "Microsoft.Data.Sqlite*", "SQLitePCLRaw.*"]) {
  if (!nugetConfig.includes(anchor)) failures.push(`Core NuGet configuration is missing ${anchor}.`);
}
const catalogLock = JSON.parse(read("core/src/Cap7CE.Core.Catalog/packages.lock.json"));
if (catalogLock.dependencies?.["net10.0"]?.["Microsoft.Data.Sqlite"]?.resolved !== "10.0.12"
    || catalogLock.dependencies?.["net10.0"]?.["SQLitePCLRaw.bundle_e_sqlite3"]?.resolved !== "2.1.12") {
  failures.push("Core native SQLite dependency graph is not locked to the reviewed versions.");
}
const packageJson = JSON.parse(read("package.json"));
const packagedFiles = packageJson.build?.files ?? [];
if (packagedFiles.some((entry) => typeof entry === "string" && normalize(entry).startsWith("core/"))) {
    failures.push("Electron Builder files must not bypass the Core capability resource boundary.");
}
if (!packageJson.scripts?.["build:core"] || !packageJson.scripts?.["test:core"]
    || !packageJson.scripts?.["probe:core-p31"] || !packageJson.scripts?.["probe:core-p31-initial"]) {
  failures.push("Core build and test commands must remain explicit npm scripts.");
}
for (const integrationPath of ["electron/main.ts", "electron/preload.ts", "src/renderer/App.tsx"]) {
  if (/Cap7CE\.Core|core[\\/]Cap7CE/i.test(read(integrationPath))) {
    failures.push(`${integrationPath} connects to Core during isolated P1 work.`);
  }
}
if (failures.length > 0) {
  console.error("Core architecture checks failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: "passed", projects: expectedProjects.size, sourceFilesChecked: coreSourceFiles.length,
    protocolTransport: "same-user-named-pipe", readerProtocol: "binary-cr1-cr2-readonly-ntfs",
    catalog: "native-sqlite-v2-multi-volume-directory-path-cache", fixtureOnly: false,
    sourceVolumeWrite: false, packaged: false, electronConnected: false
  }));
}
