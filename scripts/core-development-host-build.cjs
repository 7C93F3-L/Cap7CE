const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { selectCapabilityBuildProfile } = require("./core-capability-build-profile.cjs");

if (process.platform !== "win32") throw new Error("Core development host build requires Windows.");

const root = path.resolve(__dirname, "..");
const artifactsRoot = path.join(root, "core", "artifacts");
const outputRoot = path.join(artifactsRoot, "development-product-host");
if (path.dirname(outputRoot) !== artifactsRoot) throw new Error("Development host output escaped artifacts root.");

const environment = { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" };
const runDotnet = (args) => {
  const result = spawnSync("dotnet", args, {
    cwd: root,
    env: environment,
    stdio: "inherit",
    windowsHide: true
  });
  if (result.status !== 0) throw new Error(`dotnet ${args[0]} failed with exit code ${result.status}.`);
};

fs.rmSync(outputRoot, { recursive: true, force: true });
runDotnet(["restore", "core/Cap7CE.Core.sln", "--locked-mode", "--nologo"]);
const productProfile = selectCapabilityBuildProfile(["--product"]);
runDotnet(productProfile.frameworkPublishArguments(
  "core/src/Cap7CE.Core.Host/Cap7CE.Core.Host.csproj",
  outputRoot
));

const executablePath = path.join(outputRoot, "Cap7CE.Core.Host.exe");
if (!fs.existsSync(executablePath)) throw new Error("Product-profile development Core Host is missing.");
console.log(JSON.stringify({
  status: "built",
  profile: productProfile.name,
  executablePath,
  systemChangesPerformed: false
}));
