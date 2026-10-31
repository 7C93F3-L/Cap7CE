const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") throw new Error("Capability Setup NativeAOT smoke test requires Windows.");
const root = path.resolve(__dirname, "..");
const outputDirectory = path.join(root, "core/artifacts/product-capability/v1/setup-publish");
const executable = path.join(outputDirectory, "Cap7CE.Core.Setup.exe");
if (!fs.existsSync(executable)) throw new Error("Published NativeAOT Capability Setup is missing.");

const files = fs.readdirSync(outputDirectory).sort();
if (files.some((name) => /\.(?:dll|deps\.json|runtimeconfig\.json)$/i.test(name))) {
  throw new Error(`NativeAOT output contains framework-dependent files: ${files.join(", ")}`);
}
const executableBytes = fs.statSync(executable).size;
if (executableBytes < 1024 * 1024 || executableBytes > 8 * 1024 * 1024) {
  throw new Error(`NativeAOT Capability Setup size is outside the reviewed boundary: ${executableBytes}.`);
}
const isolatedEnvironment = {
  ...process.env,
  DOTNET_ROOT_X64: "C:\\nonexistent-cap7ce-runtime",
  DOTNET_MULTILEVEL_LOOKUP: "0"
};
const run = (args, input) => spawnSync(executable, args, {
  encoding: "utf8", env: isolatedEnvironment, input, windowsHide: true
});

const defaultRun = run([], undefined);
const defaultResult = JSON.parse(defaultRun.stdout.trim());
if (defaultRun.status !== 2 || defaultResult.reason !== "setup-contract-only"
    || defaultResult.systemChangesPerformed !== false || defaultRun.stderr !== "") {
  throw new Error("NativeAOT Capability Setup default refusal drifted.");
}
const request = JSON.stringify({
  action: "enable", runtimeState: "missing", installationState: "notInstalled",
  ownershipState: "unowned", catalogDisposition: "preserve", supportedSystem: true
});
const dryRun = run(["--dry-run-plan"], request);
const plan = JSON.parse(dryRun.stdout.trim());
if (dryRun.status !== 0 || dryRun.stderr !== ""
    || plan.nextStep !== "launchRuntimeInstallerForeground"
    || plan.systemChangesPerformed !== false
    || JSON.stringify(plan.externalInstallerArguments) !== JSON.stringify(["/install", "/norestart"])) {
  throw new Error("NativeAOT Capability Setup dry-run contract drifted.");
}

console.log(JSON.stringify({ status: "passed", nativeAot: true, executableBytes,
  installedDotnetRequired: false, systemChangesPerformed: false }));
