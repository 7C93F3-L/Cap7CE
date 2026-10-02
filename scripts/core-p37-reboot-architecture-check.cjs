const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const prepare = read("scripts/core-p37-reboot-prepare.ps1");
const resume = read("scripts/core-p37-reboot-resume.ps1");
const packageJson = JSON.parse(read("package.json"));
const failures = [];

for (const [source, anchor, description] of [
  [prepare, "$productName = 'Cap7CE-P37-Lifecycle'", "isolated prepare target"],
  [prepare, "--activation-coordinator --action $setupAction --catalog preserve", "explicit install or repair UAC"],
  [prepare, "phase = 'ready-for-reboot'", "durable reboot checkpoint"],
  [prepare, "preRebootBootTicks", "pre-reboot boot identity"],
  [prepare, "service.StartType -ne 'Manual'", "Demand Start precondition"],
  [prepare, "rebootRequestedByProbe = $false", "manual reboot boundary"],
  [resume, "p37-reboot-not-observed", "real reboot requirement"],
  [resume, "service.Status -ne 'Stopped'", "no automatic service start"],
  [resume, "--reader-p37-lifecycle-client", "ordinary post-reboot demand start"],
  [resume, "--activation-coordinator --action remove --catalog remove", "explicit uninstall UAC"],
  [resume, "ordinaryStartElevationRequested = $false", "ordinary-start no-UAC evidence"],
  [resume, "zeroResidue = $true", "post-reboot cleanup evidence"]
]) {
  if (!source.includes(anchor)) failures.push(`P3.7 reboot boundary is missing ${description}.`);
}
if (/Restart-Computer|shutdown\.exe|schtasks|CurrentVersion\\Run/i.test(prepare + resume)) {
  failures.push("P3.7 reboot tooling must not reboot, schedule itself, or modify login startup.");
}
if (/C:\\Users\\|S-1-5-21-|E:\\/i.test(prepare + resume)) {
  failures.push("P3.7 reboot tooling contains a local identity, SID, or source-volume path.");
}
if (!packageJson.scripts?.["prepare:core-p37-reboot"]?.includes("core-p37-reboot-prepare.ps1") ||
    !packageJson.scripts?.["resume:core-p37-reboot"]?.includes("core-p37-reboot-resume.ps1")) {
  failures.push("P3.7 reboot prepare and resume must remain explicit npm commands.");
}

if (failures.length) {
  console.error("Core P3.7 reboot architecture checks failed:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "passed", automaticReboot: false,
    scheduledTask: false, loginStartupChanged: false, isolatedIdentity: true,
    durableCheckpoint: true, postRebootDemandStart: true, cleanupRequired: true }));
}
