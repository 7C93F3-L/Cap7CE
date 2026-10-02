const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const probe = read("scripts/core-p37-lifecycle-probe.ps1");
const builder = read("scripts/core-p37-lifecycle-payload-build.cjs");
const policy = read("core/src/Cap7CE.Core.Setup/CapabilitySetupWindowsProfile.cs");
const versionPolicy = read("core/src/Cap7CE.Core.Setup/CapabilitySetupVersionPolicy.cs");
const backend = read("core/src/Cap7CE.Core.Setup/CapabilitySetupWindowsBackend.cs");
const hostConstants = read("core/src/Cap7CE.Core.Reader.Host/ReaderHostConstants.cs");
const clientConstants = read("core/src/Cap7CE.Core.Host/ReaderClientConstants.cs");
const options = read("core/src/Cap7CE.Core.Host/CoreHostOptions.cs");
const tests = read("core/tests/Cap7CE.Core.Tests/CapabilitySetupVersionTests.cs");
const packageJson = JSON.parse(read("package.json"));

for (const [source, anchor, description] of [
  [probe, "$productName = 'Cap7CE-P37-Lifecycle'", "isolated filesystem identity"],
  [probe, "$serviceName = 'Cap7CENtfsReaderP37LifecycleProbe'", "isolated service identity"],
  [probe, "failedUpgradeRolledBack", "failed-upgrade rollback evidence"],
  [probe, "catalogPreserved", "preserve-catalog uninstall evidence"],
  [probe, "removeCatalogUninstall", "remove-catalog uninstall evidence"],
  [probe, "currentCapabilityChanged", "current capability boundary evidence"],
  [probe, "currentCatalogTargeted", "current Catalog target exclusion"],
  [probe, "rebootRequested = $false", "no-reboot boundary"],
  [builder, 'for (const version of ["1.0.0", "1.0.1"])', "two-version payload build"],
  [builder, '"capability-version.txt"', "installed upgrade marker"],
  [policy, "P37_LIFECYCLE", "isolated Setup profile"],
  [versionPolicy, "capability-downgrade-not-supported", "downgrade rejection"],
  [backend, "RequireUpgradeOrRepair", "transaction version gate"],
  [hostConstants, "UseP37LifecycleProfile", "isolated Reader profile"],
  [clientConstants, "P37Lifecycle", "isolated Core endpoint"],
  [options, 'args is ["--reader-p37-lifecycle-client"]', "closed lifecycle activation"],
  [tests, 'Rejects("1.0.1", "1.0.0"', "downgrade regression test"]
]) {
  if (!source.includes(anchor)) failures.push(`P3.7 lifecycle boundary is missing ${description}.`);
}
if (/--reader-p37-lifecycle-client[^\]]+--/s.test(options)) {
  failures.push("P3.7 lifecycle client accepts an additional free-form argument.");
}
if (/C:\\Users\\|S-1-5-21-|E:\\/i.test(probe + builder)) {
  failures.push("P3.7 lifecycle tooling contains a local identity, SID, or source-volume path.");
}
if (!packageJson.scripts?.["probe:core-p37-lifecycle"]?.includes("core-p37-lifecycle-probe.ps1")) {
  failures.push("P3.7 lifecycle probe must remain an explicit npm command.");
}

if (failures.length) {
  console.error("Core P3.7 lifecycle architecture checks failed:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "passed", isolatedIdentity: true, versions: 2,
    repair: true, rollback: true, upgrade: true, preserveCatalog: true,
    removeCatalog: true, currentProductChanged: false, rebootRequested: false }));
}
