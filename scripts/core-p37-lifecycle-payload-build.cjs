const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") throw new Error("P3.7 lifecycle build requires Windows.");
const root = path.resolve(__dirname, "..");
const artifacts = path.join(root, "core", "artifacts");
const output = path.join(artifacts, "p37-lifecycle");
if (path.dirname(output) !== artifacts) throw new Error("P3.7 output escaped artifacts root.");
const environment = { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" };
const runDotnet = (args) => {
  const result = spawnSync("dotnet", args, {
    cwd: root, env: environment, stdio: "inherit", windowsHide: true
  });
  if (result.status !== 0) throw new Error(`dotnet ${args[0]} failed with exit code ${result.status}.`);
};
const collectFiles = (payloadRoot) => {
  const files = [];
  for (const component of ["core", "reader"]) {
    const componentRoot = path.join(payloadRoot, component);
    const pending = [componentRoot];
    while (pending.length) {
      const directory = pending.pop();
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) pending.push(absolute);
        else if (entry.isFile()) {
          if (entry.name.toLowerCase().endsWith(".pdb")) throw new Error("Payload contains symbols.");
          const contents = fs.readFileSync(absolute);
          files.push({
            component,
            relativePath: path.relative(componentRoot, absolute).replaceAll("\\", "/"),
            length: contents.length,
            sha256: crypto.createHash("sha256").update(contents).digest("hex")
          });
        } else throw new Error("Payload contains an unsupported entry type.");
      }
    }
  }
  return files.sort((left, right) => {
    const leftKey = `${left.component}/${left.relativePath}`;
    const rightKey = `${right.component}/${right.relativePath}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
};
const trimRuntimeAssets = (payloadRoot) => {
  const runtimes = path.join(payloadRoot, "core", "runtimes");
  const entries = fs.readdirSync(runtimes, { withFileTypes: true });
  if (!entries.some((entry) => entry.isDirectory() && entry.name === "win-x64")) {
    throw new Error("Core payload is missing win-x64 runtime assets.");
  }
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== "win-x64") {
      fs.rmSync(path.join(runtimes, entry.name), { recursive: true, force: true });
    }
  }
};
const baseManifest = JSON.parse(fs.readFileSync(
  path.join(root, "core/deployment/capability-setup-manifest.v1.json"), "utf8"));

fs.rmSync(output, { recursive: true, force: true });
runDotnet(["restore", "core/Cap7CE.Core.sln", "--locked-mode", "--nologo"]);
for (const version of ["1.0.0", "1.0.1"]) {
  const versionRoot = path.join(output, version);
  const bundleRoot = path.join(versionRoot, "bundle");
  const payloadRoot = path.join(bundleRoot, "payload");
  const setupOutput = path.join(versionRoot, "setup-publish");
  const setupManifestPath = path.join(versionRoot, "capability-setup-manifest.v1.json");
  const payloadManifestPath = path.join(versionRoot, "capability-payload-manifest.v1.json");
  fs.mkdirSync(path.join(payloadRoot, "core"), { recursive: true });
  fs.mkdirSync(path.join(payloadRoot, "reader"), { recursive: true });
  const publish = (project, destination) => runDotnet([
    "publish", project, "--configuration", "Release", "--self-contained", "false",
    "--no-restore", "--nologo", "--output", destination, "-p:PlatformTarget=x64",
    "-p:DebugType=None", "-p:DebugSymbols=false", "-p:P37LifecycleProfile=true",
    `-p:Version=${version}`
  ]);
  publish("core/src/Cap7CE.Core.Host/Cap7CE.Core.Host.csproj", path.join(payloadRoot, "core"));
  publish("core/src/Cap7CE.Core.Reader.Host/Cap7CE.Core.Reader.Host.csproj", path.join(payloadRoot, "reader"));
  fs.writeFileSync(path.join(payloadRoot, "core", "capability-version.txt"), `${version}\n`, "utf8");
  trimRuntimeAssets(payloadRoot);
  const setupManifest = { ...baseManifest, capabilityVersion: version };
  fs.writeFileSync(setupManifestPath, `${JSON.stringify(setupManifest, null, 2)}\n`, "utf8");
  const files = collectFiles(payloadRoot);
  fs.writeFileSync(payloadManifestPath, `${JSON.stringify({
    schemaVersion: 1,
    capabilityId: setupManifest.capabilityId,
    capabilityVersion: version,
    files
  }, null, 2)}\n`, "utf8");
  runDotnet([
    "publish", "core/src/Cap7CE.Core.Setup/Cap7CE.Core.Setup.csproj",
    "--configuration", "Release", "--runtime", "win-x64", "--self-contained", "true",
    "--no-restore", "--nologo", "--output", setupOutput, "-p:RestoreLockedMode=true",
    "-p:DebugType=None", "-p:P37LifecycleProfile=true", `-p:Version=${version}`,
    `-p:CapabilitySetupManifestPath=${setupManifestPath}`,
    `-p:CapabilityPayloadManifestPath=${payloadManifestPath}`
  ]);
  const setup = path.join(setupOutput, "Cap7CE.Core.Setup.exe");
  if (!fs.existsSync(setup)) throw new Error(`P3.7 Setup ${version} is missing.`);
  fs.copyFileSync(setup, path.join(bundleRoot, "Cap7CE.Core.Setup.exe"));
  console.log(JSON.stringify({ status: "built", version, files: files.length,
    payloadBytes: files.reduce((sum, file) => sum + file.length, 0),
    setupBytes: fs.statSync(setup).size, systemChangesPerformed: false }));
}
