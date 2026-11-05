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
const capabilityBuilder = read("scripts/native-installer-build.cjs");
const capabilityNsis = read("build/native-installer.nsi");
const installerNsis = read("build/installer-custom.nsh");
requireAnchor(capabilityNsis, 'SpaceTexts none', "no misleading uninstall space estimate");
if (/GetSize|customUnInit/.test(installerNsis)) failures.push("Uninstall must not scan model directories for display-only size estimates.");
if (!(capabilityNsis.indexOf('Call RequireStopped') < capabilityNsis.indexOf('RMDir /r "$INSTDIR\\app"')))
  failures.push("Running application checks must precede native app replacement.");
const packageJson = JSON.parse(read("package.json"));
const installerSmoke = read("scripts/native-installer-smoke.cjs");
const installHook=installerNsis.split('!macro customInstall')[1]?.split('!macroend')[0]??"";
requireAnchor(installHook, 'nsExec::ExecToLog', "synchronous mandatory search setup with live installer details");
requireAnchor(installHook, 'Pop $0', "captured setup exit code before completion");
requireAnchor(installHook, '--install-search-service', "default service configuration for installs and updates");
requireAnchor(installHook, 'SetErrorLevel 3010', "restart-required installation result");
requireAnchor(installHook, 'Abort', "installation failure when search setup fails");
const bootstrap=read('shell/Cap7CE.WinUI/Services/InstallerSearchSetup.cs');
requireAnchor(bootstrap, 'InstallerAccount.MatchesDesktop()', "setup account ownership check");
if(!(bootstrap.indexOf('if(args is ["--verify-search-setup-entry"])return 0')<bootstrap.indexOf('await NativeCoreSetup.RunAsync'))) {
  failures.push("Package verification must stop before any service setup.");
}
requireAnchor(installerSmoke, '--verify-search-setup-entry', "packaged self-contained setup entry verification");
const conditionals = [];
for (const line of installerNsis.split(/\r?\n/).map(value => value.trim())) {
  if (/^!if(?:def|ndef|macrodef|macrondef)?\b/.test(line)) conditionals.push(line);
  else if (line === "!endif" && !conditionals.pop()) failures.push("Native installer has an unmatched !endif.");
  else if (/^!else\b/.test(line) && !conditionals.length) failures.push("Native installer has an unmatched !else.");
}
if (conditionals.length) failures.push("Native installer has unclosed conditional blocks.");
for (const directory of ["Core", "NtfsReader", "CapabilitySetup"]) {
  requireAnchor(installerNsis, `Rename "$INSTDIR\\${directory}" "$cap7cePreserveRoot\\${directory}"`, `preserve capability ${directory} during app replacement`);
  requireAnchor(installerNsis, `Rename "$cap7cePreserveRoot\\${directory}" "$INSTDIR\\${directory}"`, `restore capability ${directory} after app replacement`);
}
requireAnchor(installerNsis, 'FileWrite $2 "ExitCode=$0$\\r$\\n$1$\\r$\\n"', "persist failed capability cleanup response");
requireAnchor(installerNsis, 'AttributesAfter=$2', "record selected cleanup targets and outcomes");
requireAnchor(installerNsis, 'FileSeek $3 0 END', "append cleanup diagnostics without overwriting earlier targets");
requireAnchor(installerNsis, 'RMDir "$INSTDIR\\Core"', "remove the empty Core container after cleanup");
const userCleanup=installerNsis.split('Function un.cap7ceCleanupSelectedUserData')[1]?.split('FunctionEnd')[0]??"";
requireAnchor(userCleanup, 'SectionGetFlags 1 $0', "explicit user-data selection before cleanup");
requireAnchor(userCleanup, 'Abort "$(cap7ceUserCleanupFailed)"', "stop uninstall when selected data remain");
const removal=installerNsis.split('!macro customRemoveFiles')[1]?.split('!macroend')[0]??"";
if (!(removal.indexOf('Call un.cap7ceRemoveCoreCapability') < removal.indexOf('Call un.cap7ceCleanupSelectedUserData')
  && removal.indexOf('Call un.cap7ceCleanupSelectedUserData') < removal.indexOf('Call un.cap7ceRemoveApplicationFiles'))) {
  failures.push("Selected user data must be checked after capability removal and before application removal.");
}
for(const target of ['$LOCALAPPDATA\\Cap7CE','$LOCALAPPDATA\\Cap7CE-PhaseF','$LOCALAPPDATA\\cap7ce-updater','$APPDATA\\Cap7CE'])
  requireAnchor(userCleanup,`Push "${target}"`,"selected-only cleanup of "+target);

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
  [capabilityBuilder, '`/DSTAGED_APP=${app}`', "prepared native payload boundary"],
  [capabilityNsis, "installer-custom.nsh", "shared product NSIS lifecycle"],
  [installerNsis, "--activation-coordinator --action remove --catalog $1", "authenticated uninstall removal"],
  [installerNsis, "SectionGetFlags 1 $0", "Catalog cleanup following the existing user-data choice"],
  [installerSmoke, "--verify-payload", "package-extracted payload verification"],
  [installerSmoke, "DOTNET_ROOT_X64", "NativeAOT package runtime-isolation check"],
  [installerSmoke, "assert.equal(report.systemChangesPerformed,false)", "read-only package inspection"]
]) requireAnchor(source, anchor, description);
if (/cap7ceCleanupCoreCatalog|CAP7CE_CLEAN_CORE_CATALOG_SECTION|CAP7CE_PRESERVE_CORE_CATALOG/.test(installerNsis)) {
  failures.push("Full-disk Catalog cleanup must not create a separate uninstall choice.");
}
const pack = read("scripts/native-pack.cjs");
if (!pack.includes("core/artifacts/product-capability/v1/bundle")) failures.push("Native pack must include the fixed product capability bundle.");
requireAnchor(capabilityNsis, 'File /r "${STAGED_APP}\\*.*"', "installer extraction restricted to the prepared native directory");
if (failures.length) {
  console.error("Core capability installer architecture checks failed:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "passed", packageIdentity: "native-product",
    payload: "deterministic-bundle", activation: "authenticated-runas-coordinator",
    uninstallCatalogPolicy: "follow-user-data-choice", regularPackageConnected: true,
    nativeClientConnected: true, released: false }));
}
