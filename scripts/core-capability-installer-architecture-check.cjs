const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const failures = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const requireAnchor = (source, anchor, description) => {
  if (!source.includes(anchor)) failures.push(`Core capability installer is missing ${description}.`);
};

const setupDirectory = path.join(root, "core", "src", "Cap7CE.Core.Setup");
const setupSources = fs.readdirSync(setupDirectory)
  .filter((name) => name.endsWith(".cs"))
  .map((name) => ({ name, source: read(`core/src/Cap7CE.Core.Setup/${name}`) }));
const coordinator = setupSources.find((entry) => entry.name === "CapabilitySetupCoordinatorCli.cs")?.source ?? "";
const coordinatorArguments = setupSources.find((entry) => entry.name === "CapabilitySetupCoordinatorArguments.cs")?.source ?? "";
const elevationLauncher = setupSources.find((entry) => entry.name === "CapabilitySetupElevatedServerLauncher.cs")?.source ?? "";
const coordinatorDomain = `${coordinator}\n${coordinatorArguments}\n${elevationLauncher}`;
const setupWithoutCoordinator = setupSources
  .filter((entry) => !["CapabilitySetupCoordinatorCli.cs",
    "CapabilitySetupElevatedServerLauncher.cs"].includes(entry.name))
  .map((entry) => entry.source).join("\n");
const setupProgram = read("core/src/Cap7CE.Core.Setup/Program.cs");
const setupTests = read("core/tests/Cap7CE.Core.Tests/CapabilitySetupIdentityTests.cs");
const capabilityBuilder = read("build/core-capability-dev.electron-builder.cjs");
const capabilityNsis = read("build/installer-core-capability-dev.nsh");
const installerNsis = read("build/installer-custom.nsh");
const packageJson = JSON.parse(read("package.json"));
const installerSmoke = read("scripts/core-capability-installer-smoke.cjs");

for (const anchor of ["--activation-coordinator", "CapabilitySetupActivationPipe.CreateName()",
  "Environment.ProcessPath", "UseShellExecute = true", 'Verb = "runas"',
  "ProcessWindowStyle.Hidden", "activation-elevation-cancelled",
  '"--activation-server"', '"--activation-client"', "server.Id.ToString",
  "CapabilitySetupActivationCli.RunClientAsync"]) {
  requireAnchor(coordinatorDomain, anchor, "fixed ordinary-to-elevated Setup coordinator");
}
if (/HttpClient|System\.Net|WebClient|https?:\/\//.test(coordinatorDomain)) {
  failures.push("Core capability coordinator must not own runtime download or network behavior.");
}
if (/Process\.Start|System\.Diagnostics/.test(setupWithoutCoordinator)) {
  failures.push("Capability Setup launches a process outside the fixed elevation coordinator.");
}
for (const anchor of ["CapabilitySetupCoordinatorCli.IsRequest",
  "CapabilitySetupCoordinatorCli.RunAsync"]) {
  requireAnchor(setupProgram, anchor, "coordinator dispatch");
}
for (const anchor of ["setup coordinator rejects free paths",
  "setup coordinator rejects unknown actions"]) {
  requireAnchor(setupTests, anchor, `closed coordinator coverage: ${anchor}`);
}

for (const [source, anchor, description] of [
  [capabilityBuilder, 'appId: "Cap7CE.Core.P33c.Dev"', "isolated development application identity"],
  [capabilityBuilder, 'output: "release/core-capability-dev"', "isolated development package output"],
  [capabilityBuilder, 'from: "core/artifacts/capability/v1/bundle"', "deterministic capability bundle source"],
  [capabilityBuilder, 'to: "core-capability/v1"', "fixed packaged capability destination"],
  [capabilityBuilder, 'createDesktopShortcut: false', "no development desktop shortcut"],
  [capabilityBuilder, 'createStartMenuShortcut: false', "no development Start menu shortcut"],
  [capabilityBuilder, 'runAfterFinish: false', "no development app auto-launch"],
  [capabilityNsis, "installer-custom.nsh", "shared product NSIS lifecycle"],
  [installerNsis, "--activation-coordinator --action remove --catalog $1", "authenticated uninstall removal"],
  [installerNsis, "SectionGetFlags 1 $0", "Catalog cleanup following the existing user-data choice"],
  [installerSmoke, "--verify-payload", "package-extracted payload verification"],
  [installerSmoke, "DOTNET_ROOT_X64", "NativeAOT package runtime-isolation check"],
  [installerSmoke, "systemChangesPerformed: false", "read-only package inspection"]
]) requireAnchor(source, anchor, description);
if (/cap7ceCleanupCoreCatalog|CAP7CE_CLEAN_CORE_CATALOG_SECTION|CAP7CE_PRESERVE_CORE_CATALOG/.test(installerNsis)) {
  failures.push("Full-disk Catalog cleanup must not create a separate uninstall choice.");
}
const regularCapability = (packageJson.build?.extraResources ?? []).filter((entry) => entry?.to === "core-capability/v1");
if (regularCapability.length !== 1 || regularCapability[0].from !== "core/artifacts/product-capability/v1/bundle") {
  failures.push("The regular package must include exactly one deterministic Core capability bundle.");
}
if (!packageJson.scripts?.pack?.includes("publish:core-product-capability")
    || !packageJson.scripts?.["dist:installer"]?.includes("publish:core-product-capability")) {
  failures.push("Regular package commands must rebuild the deterministic capability before packaging.");
}
if (!packageJson.scripts?.["dist:core-capability-installer"]?.includes("publish:core-capability")
    || !packageJson.scripts?.["dist:core-capability-installer"]?.includes("core-capability-installer-smoke.cjs")) {
  failures.push("Development capability installer must build and inspect the deterministic payload.");
}

if (failures.length) {
  console.error("Core capability installer architecture checks failed:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "passed", packageIdentity: "isolated-development",
    payload: "deterministic-bundle", activation: "authenticated-runas-coordinator",
    uninstallCatalogPolicy: "follow-user-data-choice", regularPackageConnected: true,
    electronConnected: true, released: false }));
}
