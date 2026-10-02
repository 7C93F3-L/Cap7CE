const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { selectCapabilityBuildProfile } = require("./core-capability-build-profile.cjs");
if (process.platform !== "win32") throw new Error("Core capability payload build requires Windows.");
const root = path.resolve(__dirname, "..");
const artifactsRoot = path.join(root, "core", "artifacts");
const buildProfile = selectCapabilityBuildProfile(process.argv.slice(2));
const outputRoot = path.join(artifactsRoot, buildProfile.artifactDirectory, "v1");
const bundleRoot = path.join(outputRoot, "bundle");
const payloadRoot = path.join(bundleRoot, "payload");
const manifestPath = path.join(outputRoot, "capability-payload-manifest.v1.json");
const setupPublishRoot = path.join(outputRoot, "setup-publish");
if (path.dirname(path.dirname(outputRoot)) !== artifactsRoot) throw new Error("Capability output escaped artifacts root.");

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(payloadRoot, "core"), { recursive: true });
fs.mkdirSync(path.join(payloadRoot, "reader"), { recursive: true });
const environment = { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" };
const runDotnet = (args) => {
  const result = spawnSync("dotnet", args, { cwd: root, env: environment, stdio: "inherit", windowsHide: true });
  if (result.status !== 0) throw new Error(`dotnet ${args[0]} failed with exit code ${result.status}.`);
};
runDotnet(["restore", "core/Cap7CE.Core.sln", "--locked-mode", "--nologo"]);
runDotnet(buildProfile.frameworkPublishArguments(
  "core/src/Cap7CE.Core.Host/Cap7CE.Core.Host.csproj", path.join(payloadRoot, "core")));
runDotnet(buildProfile.frameworkPublishArguments(
  "core/src/Cap7CE.Core.Reader.Host/Cap7CE.Core.Reader.Host.csproj", path.join(payloadRoot, "reader")));
const runtimesRoot = path.join(payloadRoot, "core", "runtimes");
const runtimeDirectories = fs.readdirSync(runtimesRoot, { withFileTypes: true });
if (!runtimeDirectories.some((entry) => entry.isDirectory() && entry.name === "win-x64")) {
  throw new Error("Core payload is missing the win-x64 native runtime directory.");
}
for (const entry of runtimeDirectories) {
  if (!entry.isDirectory() || entry.name === "win-x64") continue;
  fs.rmSync(path.join(runtimesRoot, entry.name), { recursive: true, force: true });
}

const setupManifest = JSON.parse(fs.readFileSync(
  path.join(root, "core/deployment/capability-setup-manifest.v1.json"), "utf8"));
const files = [];
for (const component of ["core", "reader"]) {
  const componentRoot = path.join(payloadRoot, component);
  const pending = [componentRoot];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(absolutePath);
      else if (entry.isFile()) {
        if (entry.name.toLowerCase().endsWith(".pdb")) throw new Error("Payload unexpectedly contains symbols.");
        const contents = fs.readFileSync(absolutePath);
        files.push({
          component,
          relativePath: path.relative(componentRoot, absolutePath).replaceAll("\\", "/"),
          length: contents.length,
          sha256: crypto.createHash("sha256").update(contents).digest("hex")
        });
      } else throw new Error("Payload contains an unsupported entry type.");
    }
  }
}
files.sort((left, right) => {
  const leftKey = `${left.component}/${left.relativePath}`;
  const rightKey = `${right.component}/${right.relativePath}`;
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
});
const payloadManifest = {
  schemaVersion: 1,
  capabilityId: setupManifest.capabilityId,
  capabilityVersion: setupManifest.capabilityVersion,
  files
};
fs.writeFileSync(manifestPath, `${JSON.stringify(payloadManifest, null, 2)}\n`, "utf8");

runDotnet([
  "publish", "core/src/Cap7CE.Core.Setup/Cap7CE.Core.Setup.csproj", "--configuration", "Release",
  "--runtime", "win-x64", "--self-contained", "true", "--no-restore", "--nologo",
  "--output", setupPublishRoot, "-p:RestoreLockedMode=true", "-p:DebugType=None",
  `-p:CapabilityPayloadManifestPath=${manifestPath}`,
  ...buildProfile.setupProperties
]);
const setupExecutable = path.join(setupPublishRoot, "Cap7CE.Core.Setup.exe");
if (!fs.existsSync(setupExecutable)) throw new Error("NativeAOT Setup executable is missing.");
fs.copyFileSync(setupExecutable, path.join(bundleRoot, "Cap7CE.Core.Setup.exe"));

const totalBytes = files.reduce((sum, file) => sum + file.length, 0);
console.log(JSON.stringify({ status: "built", files: files.length, payloadBytes: totalBytes,
  profile: buildProfile.name,
  setupBytes: fs.statSync(setupExecutable).size, runtimeAssets: "win-x64-only",
  symbolsBundled: false, systemChangesPerformed: false }));
