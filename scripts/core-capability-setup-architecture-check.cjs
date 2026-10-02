const fs = require("node:fs");
const path = require("node:path");
const { createCapabilitySetupSourceGroups } = require("./core-capability-setup-source-groups.cjs");
const root = path.resolve(__dirname, "..");
const failures = [], read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const requireAnchor = (source, anchor, description) => {
  if (!source.includes(anchor)) failures.push(`Capability Setup is missing ${description}.`);
};

const project = read("core/src/Cap7CE.Core.Setup/Cap7CE.Core.Setup.csproj");
const manifestSource = read("core/deployment/capability-setup-manifest.v1.json");
const manifest = JSON.parse(manifestSource);
const setupDirectory = path.join(root, "core/src/Cap7CE.Core.Setup");
const setupSourceEntries = fs.readdirSync(setupDirectory)
  .filter((name) => name.endsWith(".cs"))
  .map((name) => ({ name, source: read(`core/src/Cap7CE.Core.Setup/${name}`) }));
const {
  setupSources, payloadVerifier, peerIdentity, activationPipe, activationProtocol,
  activationFrameCodec, volumeSelection, windowsPolicy, windowsBackend, windowsAcl,
  windowsService, serviceHardening, windowsFileSystem, windowsVerifier,
  setupSourcesWithoutReadOnlyFiles, setupSourcesWithoutPeerIdentity,
  setupSourcesWithoutServicePlatform, setupSourcesWithoutMutationBackend
} = createCapabilitySetupSourceGroups(setupSourceEntries);
const tests = ["CapabilitySetupContractTests.cs", "CapabilitySetupPayloadTests.cs",
  "CapabilitySetupTransactionTests.cs", "CapabilitySetupIdentityTests.cs"]
  .map((name) => read(`core/tests/Cap7CE.Core.Tests/${name}`)).join("\n");
const nativeSmoke = read("scripts/core-setup-native-smoke.cjs");
const payloadBuild = read("scripts/core-capability-payload-build.cjs");
const buildProfile = read("scripts/core-capability-build-profile.cjs");
const payloadSmoke = read("scripts/core-capability-payload-smoke.cjs");
const nugetConfig = read("core/NuGet.Config");
const setupLock = JSON.parse(read("core/src/Cap7CE.Core.Setup/packages.lock.json"));
const hostReaderConstants = read("core/src/Cap7CE.Core.Host/ReaderClientConstants.cs");
const readerHostConstants = read("core/src/Cap7CE.Core.Reader.Host/ReaderHostConstants.cs");

for (const [anchor, description] of [
  ["<TargetFramework>net10.0-windows</TargetFramework>", "Windows .NET 10 target"],
  ["<IsAotCompatible>true</IsAotCompatible>", "NativeAOT compatibility analysis"],
  ["<PublishAot>true</PublishAot>", "NativeAOT publication"],
  ["<RuntimeIdentifier>win-x64</RuntimeIdentifier>", "fixed Windows x64 runtime identifier"],
  ["Cap7CE.Core.Layer\" Value=\"Setup", "isolated Setup layer"],
  ["capability-setup-manifest.v1.json", "embedded deployment manifest"],
  ["CapabilityPayloadManifestPath", "build-time embedded payload manifest"]
]) requireAnchor(project, anchor, description);
if (/<ProjectReference|<PackageReference/.test(project)) failures.push("Capability Setup must remain dependency-free.");
for (const anchor of ["Microsoft.DotNet.ILCompiler", "runtime.win-x64.Microsoft.DotNet.ILCompiler",
  "Microsoft.NETCore.App.Runtime.NativeAOT.win-x64"]) {
  requireAnchor(nugetConfig, anchor, `official NativeAOT package mapping: ${anchor}`);
}
const setupDependencies = setupLock.dependencies?.["net10.0-windows7.0"];
const setupRidDependencies = setupLock.dependencies?.["net10.0-windows7.0/win-x64"];
if (setupDependencies?.["Microsoft.DotNet.ILCompiler"]?.resolved !== "10.0.12"
    || setupDependencies?.["Microsoft.NET.ILLink.Tasks"]?.resolved !== "10.0.12"
    || setupRidDependencies?.["runtime.win-x64.Microsoft.DotNet.ILCompiler"]?.resolved !== "10.0.12") {
  failures.push("Capability Setup NativeAOT compiler graph is not locked to .NET 10.0.12.");
}

const expectedRuntime = {
  frameworkName: "Microsoft.NETCore.App", minimumVersion: "10.0.12", architecture: "win-x64",
  installerUrl: "https://builds.dotnet.microsoft.com/dotnet/Runtime/10.0.12/dotnet-runtime-10.0.12-win-x64.exe",
  installerSha512: "b937ae539c4ab21f885b033178dadea98018baad777252c76251e760d81c18463b2f802e86b6a67ea066690e9ede2d66a6bc3c3e614e391505e98c4c41121400",
  presentation: "foreground", installArguments: ["/install", "/norestart"],
  repairArguments: ["/repair", "/norestart"], successExitCodes: [0, 3010], automaticRestart: false
};
if (JSON.stringify(manifest.runtime) !== JSON.stringify(expectedRuntime)) failures.push("Runtime prerequisite policy drifted.");
if (manifest.systemMutationImplemented !== true || manifest.payloadManifestRequiredAtBuild !== true) {
  failures.push("Capability Setup fixed Windows transaction entry must remain explicitly enabled.");
}
if (manifest.ownership?.runtime !== "shared-external-never-remove"
    || manifest.ownership?.catalog !== "per-user-separate-choice") failures.push("Setup ownership policy drifted.");
if (manifest.layout?.coreProgramDirectory !== "%ProgramFiles%\\Cap7CE\\Core\\v1"
    || manifest.layout?.readerProgramDirectory !== "%ProgramFiles%\\Cap7CE\\NtfsReader\\v1"
    || manifest.layout?.readerDataDirectory !== "%ProgramData%\\Cap7CE\\NtfsReader\\v1"
    || manifest.layout?.catalogDirectory !== "%LocalAppData%\\Cap7CE\\Core") failures.push("Setup layout policy drifted.");

for (const [anchor, description] of [
  ["LaunchRuntimeInstallerForeground", "foreground Microsoft installer plan"],
  ["AwaitRestart", "user-controlled restart boundary"],
  ["LaunchCapabilitySetupElevated", "separate Cap7CE elevation plan"],
  ["owned-by-another-user", "second-account ownership block"],
  ["installation-owner-missing", "missing-owner safety block"],
  ["capability-remove-required-native", "runtime-independent NativeAOT removal boundary"],
  ["PreserveMicrosoftRuntime", "shared runtime preservation"],
  ["setup-contract-only", "default mutation refusal"],
  ["--dry-run-plan", "retained dry-run entry"],
  ["bool SystemChangesPerformed", "no-mutation report"]
]) requireAnchor(setupSources, anchor, description);
for (const [anchor, description] of [
  ["CaptureRollbackState", "rollback snapshot before mutation"],
  ["VerifyPayload", "payload verification before replacement"],
  ["VerifyInstalledState", "post-install verification before ownership commit"],
  ["VerifyRemovedState", "post-remove verification before ownership clear"],
  ["RollbackIncomplete", "structured incomplete rollback result"],
  ["SucceededCleanupPending", "committed result with deferred cleanup"],
  ["FinalizeAsync(CancellationToken.None)", "post-commit cleanup independent from request cancellation"],
  ["CancellationToken.None", "rollback that survives request cancellation"],
  ["invalid-transaction-plan", "transaction plan validation"]
]) requireAnchor(setupSources, anchor, description);
for (const [anchor, description] of [
  ["--verify-payload", "fixed adjacent-payload verification entry"],
  ["AppContext.BaseDirectory", "payload location derived from the Setup executable"],
  ["payload-manifest-missing", "missing embedded payload manifest refusal"]
]) requireAnchor(setupSources, anchor, description);
for (const anchor of ["JsonSourceGenerationOptions", "JsonStringEnumConverter<CapabilitySetupNextStep>"]) {
  requireAnchor(setupSources, anchor, "reflection-free NativeAOT JSON metadata");
}

for (const [pattern, description] of [
  [/Process\.Start|System\.Diagnostics|HttpClient|System\.Net|WebClient/, "download or process-launch code"]
]) if (pattern.test(setupSourcesWithoutPeerIdentity)) failures.push(`Capability Setup contains ${description}.`);
if (/ServiceController|System\.ServiceProcess|Microsoft\.Win32\.Registry|\bRegistry/.test(setupSourcesWithoutServicePlatform)) {
  failures.push("Capability Setup contains service or registry code outside the fixed Windows service backend.");
}
if (/DllImport|WindowsIdentity|WindowsPrincipal|\brunas\b|requestedExecutionLevel/i.test(setupSourcesWithoutPeerIdentity)) {
  failures.push("Capability Setup contains native or identity code outside the peer-identity verifier.");
}
if (/\b(?:File|Directory|FileStream)\s*\./.test(setupSourcesWithoutReadOnlyFiles)) {
  failures.push("Capability Setup performs file-system access outside its read-only verification boundaries.");
}
for (const pattern of [
  /\bFile\.(?:Write|Create|Delete|Move|Copy|Replace|Set)/,
  /\bDirectory\.(?:Create|Delete|Move|Set)/,
  /FileMode\.(?:Create|CreateNew|Append|Truncate)|FileAccess\.Write/
]) if (pattern.test(setupSourcesWithoutMutationBackend)) {
  failures.push("Capability Setup mutates files outside the fixed Windows transaction backend.");
}
for (const pattern of [
  /\bFile\.(?:Write|Create|Delete|Move|Copy|Replace|Set)/,
  /\bDirectory\.(?:Create|Delete|Move|Set)/,
  /FileMode\.(?:Create|CreateNew|Append|Truncate)|FileAccess\.Write/
]) if (pattern.test(payloadVerifier)) failures.push("Capability payload verification must remain read-only.");
for (const pattern of [
  /\bFile\.(?:Write|Create|Delete|Move|Copy|Replace|Set)/,
  /FileMode\.(?:Create|CreateNew|Append|Truncate)|FileAccess\.Write/
]) if (pattern.test(peerIdentity)) failures.push("Capability peer identity verification must remain read-only.");
for (const anchor of ["SHA256.HashDataAsync", "EnumerateFilesWithoutReparsePoints",
  "FileAttributes.ReparsePoint", "SetEquals(expectedFiles)", "Path.GetFullPath"]) {
  requireAnchor(payloadVerifier, anchor, "bounded read-only payload verification");
}
for (const anchor of ["PipeSecurity", "AuthenticatedUserSid", "GetNamedPipeClientProcessId",
  "GetNamedPipeServerProcessId", "RunAsClient", "SHGetKnownFolderPath",
  "CryptographicOperations.FixedTimeEquals", "activation-peer-same-process",
  "activation-server-pid-mismatch"]) {
  requireAnchor(`${activationPipe}\n${peerIdentity}`, anchor, "token-derived requester identity handshake");
}
for (const anchor of ["MaximumRequestBytes = 1_024", "MaximumResponseBytes = 4_096",
  "CapabilitySetupPeerIdentity.ValidateServer", "CapabilitySetupPeerIdentity.ResolveRequester",
  "CapabilitySetupAction Action", "CapabilityCatalogDisposition CatalogDisposition",
  "IReadOnlyList<string> VolumeLetters", "CapabilitySetupActivationResponse",
  "invalid-activation-request"]) {
  requireAnchor(`${activationProtocol}\n${setupSources}`, anchor, "bounded authenticated activation request");
}
for (const anchor of ["MaximumVolumeLetters = 26", "value[0] is < 'A' or > 'Z'",
  "StringComparer.Ordinal", "invalid-volume-selection"]) {
  requireAnchor(`${volumeSelection}\n${activationProtocol}`, anchor, "closed uppercase volume allowlist");
}
requireAnchor(activationFrameCodec, "BinaryPrimitives.WriteInt32LittleEndian", "bounded activation frame prefix");
if (/string\s+(?:UserSid|LocalApplicationData|Path|ServiceName)/.test(activationProtocol)) {
  failures.push("Capability activation request must not accept requester identity or platform paths.");
}
for (const [source, anchor, description] of [
  [windowsPolicy, "Cap7CENtfsReaderP33b2Probe", "fixed development service identity"],
  [windowsPolicy, 'Path.Combine(programFiles, profile.ProductDirectory, "Core", "v1")', "fixed Core Program Files layout"],
  [windowsPolicy, 'Path.Combine(programFiles, profile.ProductDirectory, "NtfsReader", "v1")', "fixed Reader Program Files layout"],
  [windowsPolicy, "0x00000015", "requester service-rights mask"],
  [windowsVerifier, "CapabilitySetupPayloadVerifier.VerifyInstalledAsync", "installed payload hash verification"],
  [windowsBackend, "installation-owner-missing", "unowned installation refusal"],
  [windowsBackend, "owned-by-another-user", "second-account execution refusal"],
  [windowsBackend, "ICapabilitySetupPlanBoundBackend", "backend-plan binding before mutation"],
  [windowsBackend, '"result-volume.json", 1_800, "volume", null, volumeLetters', "product Reader volume configuration"],
  [windowsFileSystem, "RequireNoReparseAncestors", "platform reparse-point refusal"],
  [windowsAcl, "SetAccessRuleProtection(isProtected: true", "protected directory ACLs"],
  [serviceHardening, "ServiceSidTypeRestricted", "restricted service SID"],
  [serviceHardening, "SeChangeNotifyPrivilege", "minimal service privilege list"],
  [windowsService, "ServiceDemandStart", "demand-start service"],
  [windowsService, "SetServiceObjectSecurity", "explicit service DACL"]
]) requireAnchor(source, anchor, description);
for (const source of [hostReaderConstants, readerHostConstants]) {
  for (const anchor of ["Cap7CENtfsReaderP33b2Probe", "cap7ce-ntfs-reader-p33b2-probe"]) {
    requireAnchor(source, anchor, "matching capability Reader deployment profile");
  }
}
for (const anchor of ["runtime installer must not be silent", "runtime restart boundary",
  "second-account boundary", "explicit catalog removal choice", "setup rejects unknown request fields",
  "rollback includes possibly partial failed stage in reverse order",
  "rollback continues after one compensation fails", "catalog remains separate by default",
  "invalid transaction rejected before mutation", "payload hash mismatch rejection",
  "unlisted payload file rejection", "payload traversal rejection",
  "duplicate payload destination rejection", "post-commit cleanup failure status",
  "cleanup failure preserves committed result",
  "setup requester SID comes from the pipe client token",
  "setup requester PID comes from the pipe handle",
  "setup activation action comes from the pipe request",
  "setup activation volume allowlist comes from the pipe request",
  "setup coordinator rejects unsafe or invalid volume allowlists",
  "P3.3b2 fixed development transaction entry is implemented"]) {
  requireAnchor(tests, anchor, `test coverage: ${anchor}`);
}
for (const integrationPath of ["electron/main.ts", "electron/preload.ts", "src/renderer/App.tsx"]) {
  if (/CapabilitySetup|Cap7CE\.Core\.Setup|capability-setup/i.test(read(integrationPath))) {
    failures.push(`${integrationPath} connects the P3.3 development transaction to Electron or Renderer.`);
  }
}
const packageJson = JSON.parse(read("package.json"));
if (!packageJson.scripts?.["publish:core-setup"]?.includes("RestoreLockedMode=true")) {
  failures.push("Capability Setup must keep an explicit locked NativeAOT publish command.");
}
if (!packageJson.scripts?.["test:core-setup-native"]?.includes("core-setup-native-smoke.cjs")
    || !packageJson.scripts?.["test:integration"]?.includes("test:core-setup-native")) {
  failures.push("NativeAOT Capability Setup smoke coverage must remain in the full test chain.");
}
if (!packageJson.scripts?.["publish:core-capability"]?.includes("core-capability-payload-build.cjs")
    || !packageJson.scripts?.["publish:core-product-capability"]?.includes("--product")
    || !packageJson.scripts?.["test:core-capability-payload"]?.includes("core-capability-payload-smoke.cjs")
    || !packageJson.scripts?.["test:integration"]?.includes("test:core-capability-payload")) {
  failures.push("Capability payload build and tamper smoke must remain in the full test chain.");
}
for (const anchor of ["DOTNET_ROOT_X64", "installedDotnetRequired: false", "systemChangesPerformed: false"]) {
  requireAnchor(nativeSmoke, anchor, "NativeAOT runtime-isolation smoke coverage");
}
for (const anchor of ["--locked-mode", "DebugType=None", "CapabilityPayloadManifestPath",
  "runtimeAssets: \"win-x64-only\"",
  "symbolsBundled: false", "systemChangesPerformed: false"]) {
  requireAnchor(payloadBuild, anchor, "fixed local capability payload build");
}
requireAnchor(buildProfile, "-p:P33CapabilityProfile=true", "isolated development capability profile");
for (const anchor of ["DOTNET_ROOT_X64", "--catalog-native-dependency-probe",
  "payload-file-length-mismatch", "payload-unlisted-file", "tamperRejected: true",
  "nativeSqliteLoaded: true", "sourceFilesRead: false", "systemChangesPerformed: false"]) {
  requireAnchor(payloadSmoke, anchor, "native capability payload tamper smoke");
}
if (failures.length) {
  console.error("Core capability setup architecture checks failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "passed", mode: "native-aot-transaction-core",
    runtimeInstaller: "microsoft-foreground", automaticRestart: false,
    payloadVerification: "sha256-exact-set-no-reparse", transactionPlatform: "development-matrix",
    requesterIdentity: "named-pipe-client-token", systemMutation: true,
    electronConnected: false, developmentPackageConfigured: true }));
}
