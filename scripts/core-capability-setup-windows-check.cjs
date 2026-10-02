const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const failures = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const requireAnchor = (source, anchor, description) => {
  if (!source.includes(anchor)) failures.push(`P3.3b2 is missing ${description}.`);
};

const options = read("core/src/Cap7CE.Core.Host/CoreHostOptions.cs"), hostProgram = read("core/src/Cap7CE.Core.Host/Program.cs");
const lifecycle = read("core/src/Cap7CE.Core.Host/ReaderLifecycleCli.cs");
const hostTests = read("core/tests/Cap7CE.Core.Tests/HostProtocolTests.cs");
const activationDomain = ["CapabilitySetupActivationCli.cs", "CapabilitySetupActivationArguments.cs", "CapabilitySetupFailureInjectingBackend.cs"]
  .map((name) => read(`core/src/Cap7CE.Core.Setup/${name}`)).join("\n");
const setupProgram = read("core/src/Cap7CE.Core.Setup/Program.cs");
const serviceCommand = read("core/src/Cap7CE.Core.Setup/CapabilitySetupServiceCommand.cs");
const probe = read("scripts/core-capability-setup-windows-probe.ps1");
const packageJson = JSON.parse(read("package.json"));

for (const [source, anchor, description] of [
  [options, '--reader-capability-lifecycle-client', "fixed ordinary capability client mode"],
  [hostProgram, "ReaderCapabilityLifecycleClient", "ordinary capability client dispatch"],
  [lifecycle, "ReaderClientConstants.Capability", "capability service endpoint selection"],
  [hostTests, "reader capability lifecycle client must reject free arguments", "closed capability client arguments"]
]) requireAnchor(source, anchor, description);
for (const anchor of ["--activation-server", "--activation-server-failure-probe",
  "--activation-client", "CapabilitySetupWindowsBackend", "ICapabilitySetupPlanBoundBackend",
  "ApplyDataPermissions", "fixed-development-failure-probe"]) {
  requireAnchor(activationDomain, anchor, "fixed development transaction entry");
}
for (const anchor of ["CapabilitySetupActivationCli.IsServerRequest",
  "CapabilitySetupActivationCli.IsClientRequest"]) {
  requireAnchor(setupProgram, anchor, "fixed activation dispatch");
}
for (const anchor of ["RequireExecutable", "CommandLineToArgvW", "count != 1", "Path.GetFullPath"]) {
  requireAnchor(serviceCommand, anchor, "argument-free normalized service executable validation");
}

if (!packageJson.scripts?.["probe:core-capability-setup"]?.includes("core-capability-setup-windows-probe.ps1")) {
  failures.push("P3.3b2 is missing the fixed Windows transaction development command.");
}
for (const anchor of ["-Verb RunAs", "--activation-server-failure-probe",
  "--reader-capability-lifecycle-client", "failureRolledBack", "rollbackPreservedService",
  "serviceRemoved", "directoriesRemoved", "catalogPreserved",
  "sourceFilesRead = $false", "sourceVolumeWritten = $false", "networkUsed = $false"]) {
  requireAnchor(probe, anchor, "single-UAC development matrix");
}

for (const integrationPath of ["electron/main.ts", "electron/preload.ts", "src/renderer/App.tsx",
  "build/installer-custom.nsh"]) {
  if (/reader-capability-lifecycle-client|Cap7CENtfsReaderP33b2Probe/.test(read(integrationPath))) {
    failures.push(`${integrationPath} connects the P3.3b2 development matrix to the product.`);
  }
}

if (failures.length) {
  console.error("Core capability Windows matrix checks failed:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "passed", uac: "single-development-probe",
    ordinaryDemandStart: true, rollbackProbe: true, zeroResidue: true,
    electronConnected: false, developmentPackageConfigured: true }));
}
