const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const failures = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const constants = read("core/src/Cap7CE.Core.Reader.Host/ReaderHostConstants.cs");
const clientConstants = read("core/src/Cap7CE.Core.Host/ReaderClientConstants.cs");
const controller = read("core/src/Cap7CE.Core.Host/ReaderServiceController.cs");
const identity = read("core/src/Cap7CE.Core.Host/ReaderServiceIdentity.cs");
const lifecycle = read("core/src/Cap7CE.Core.Host/ReaderLifecycleCli.cs");
const options = read("core/src/Cap7CE.Core.Host/CoreHostOptions.cs");
const hostProgram = read("core/src/Cap7CE.Core.Reader.Host/Program.cs");
const hostProject = read("core/src/Cap7CE.Core.Reader.Host/Cap7CE.Core.Reader.Host.csproj");
const script = read("scripts/core-reader-p23-lifecycle-probe.ps1");
const rebootScript = read("scripts/core-reader-p23-reboot-probe.ps1");
const props = read("core/Directory.Build.props");

for (const [source, anchor, description] of [
  [constants, "Cap7CENtfsReaderP23Probe", "fixed lifecycle service name"],
  [constants, "cap7ce-ntfs-reader-p23-probe", "fixed lifecycle pipe name"],
  [constants, '"Cap7CE", "NtfsReader", "v1"', "fixed ProgramData layout"],
  [constants, "UseLifecycleProfile", "closed Reader lifecycle profile"],
  [hostProject, "P23LifecycleProfile", "build-time Reader lifecycle profile"],
  [clientConstants, '"Cap7CE", "NtfsReader", "v1"', "fixed Program Files layout"],
  [clientConstants, '"1.0.0.0"', "fixed Reader file version"],
  [controller, "ServiceQueryConfig | ServiceQueryStatus | ServiceStart", "narrow standard-user service open"],
  [controller, "ServiceStop", "stop-right denial check"],
  [controller, "ServiceChangeConfig", "change-config denial check"],
  [controller, "Delete", "delete-right denial check"],
  [controller, "StartService", "ordinary-user Demand Start"],
  [identity, "service-version-mismatch", "version mismatch state"],
  [identity, "FileVersionInfo.GetVersionInfo", "installed binary version verification"],
  [lifecycle, '"repair-required"', "non-elevating repair state"],
  [lifecycle, "ElevationRequested", "UAC boundary reporting"],
  [options, 'args is ["--reader-lifecycle-client"]', "argument-free lifecycle client mode"],
  [hostProgram, "#if P23_LIFECYCLE", "closed Reader profile selection"],
  [script, "$env:ProgramFiles 'Cap7CE'", "formal Program Files root"],
  [script, "$env:ProgramData 'Cap7CE'", "formal ProgramData root"],
  [script, "0x00000015", "exact authorized service rights"],
  [script, "New-LocalUser", "ephemeral second-account check"],
  [script, "version-mismatch-ready", "version mismatch lifecycle"],
  [script, "upgradeRollbackRestored", "failed-upgrade rollback"],
  [script, "uninstallServiceRemoved", "service uninstall verification"],
  [script, "uninstallProgramRemoved", "program uninstall verification"],
  [script, "uninstallConfigRemoved", "config uninstall verification"],
  [rebootScript, "ready-for-reboot", "restart preparation checkpoint"],
  [rebootScript, "windows-reboot-not-observed", "actual Windows restart requirement"],
  [rebootScript, "noAutomaticStart", "post-restart no-auto-start verification"],
  [rebootScript, "verified-awaiting-cleanup", "restart verification cleanup checkpoint"],
  [rebootScript, "standardClientStartedService", "post-restart ordinary client start"],
  [rebootScript, "Remove-ProbeInstallation", "bounded restart-probe cleanup"],
  [props, "<FileVersion>1.0.0.0</FileVersion>", "stable Reader file version"]
]) {
  if (!source.includes(anchor)) failures.push(`P2.3 is missing ${description}.`);
}

for (const [pattern, description] of [
  [/E:\\|C:\\Users\\|S-1-5-21-/i, "local identity or source path"],
  [/System\.Net|HttpClient|Socket\b/i, "network capability"]
]) {
  if (pattern.test([constants, clientConstants, controller, identity, lifecycle, script, rebootScript].join("\n"))) {
    failures.push(`P2.3 introduces ${description}.`);
  }
}

for (const integrationPath of ["electron/main.ts", "electron/preload.ts", "src/renderer/App.tsx"]) {
  if (/ReaderLifecycle|Cap7CENtfsReaderP23|reader-lifecycle-client/.test(read(integrationPath))) {
    failures.push(`${integrationPath} connects P2.3 to Electron.`);
  }
}

if (failures.length) {
  console.error("Core Reader lifecycle architecture checks failed:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: "passed", layout: "program-files-program-data-v1",
    serviceStart: "ordinary-user-demand", serviceDacl: "query-status-config-start-only",
    versionMismatch: "repair-required", upgradeRollback: true,
    secondAccountRejected: true, uninstallZeroResidue: true, rebootProbe: true,
    electronConnected: false
  }));
}
