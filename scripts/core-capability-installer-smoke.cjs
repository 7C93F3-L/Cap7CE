const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") throw new Error("Core capability installer smoke requires Windows.");

const root = path.resolve(__dirname, "..");
const outputRoot = path.join(root, "release", "core-capability-dev");
const sourceSetupPath = path.join(
  root, "core", "artifacts", "capability", "v1", "bundle", "Cap7CE.Core.Setup.exe"
);
const artifacts = fs.readdirSync(outputRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile()
    && /^Cap7CE-Core-P33c-Dev-Setup-.*-x64\.exe$/u.test(entry.name))
  .map((entry) => path.join(outputRoot, entry.name));
if (artifacts.length !== 1) {
  throw new Error(`Expected one development installer, found ${artifacts.length}.`);
}
const installerPath = artifacts[0];

const find7za = () => {
  const cacheRoot = path.join(process.env.LOCALAPPDATA ?? "", "electron-builder", "Cache", "7zip@1.0.0");
  if (!path.isAbsolute(cacheRoot) || !fs.existsSync(cacheRoot)) return null;
  const pending = [cacheRoot];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(absolutePath);
      else if (entry.isFile() && entry.name.toLowerCase() === "7za.exe") return absolutePath;
    }
  }
  return null;
};
const sevenZip = find7za();
if (!sevenZip) throw new Error("electron-builder 7za.exe was not found after packaging.");

const run = (file, args, options = {}) => {
  const result = spawnSync(file, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    ...options
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(file)} failed with ${result.status}: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
};
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const listing = run(sevenZip, ["l", "-ba", installerPath]);
const normalizedListing = listing.replaceAll("/", "\\").toLowerCase();
const setupEntry = "resources\\core-capability\\v1\\cap7ce.core.setup.exe";
if (!normalizedListing.includes(setupEntry)) throw new Error("Packaged Setup executable is missing.");
const payloadEntries = listing.split(/\r?\n/u)
  .filter((line) => /resources[\\/]core-capability[\\/]v1[\\/]payload[\\/]/iu.test(line)
    && !/\sD\.\.\.\./u.test(line));
if (payloadEntries.length !== 18) {
  throw new Error(`Expected 18 packaged payload files, found ${payloadEntries.length}.`);
}

const extractionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cap7ce-p33c-package-"));
try {
  run(sevenZip, [
    "x", "-y", `-o${extractionRoot}`, installerPath,
    "resources\\core-capability\\v1\\*"
  ]);
  const bundleRoot = path.join(extractionRoot, "resources", "core-capability", "v1");
  const setupPath = path.join(bundleRoot, "Cap7CE.Core.Setup.exe");
  if (!fs.existsSync(sourceSetupPath)) throw new Error("Built capability Setup executable is missing.");
  const packagedSetupSha256 = sha256File(setupPath);
  const sourceSetupSha256 = sha256File(sourceSetupPath);
  if (packagedSetupSha256 !== sourceSetupSha256) {
    throw new Error("Packaged Setup executable does not match the current capability bundle.");
  }
  const isolatedDotnet = path.join(extractionRoot, "isolated-dotnet");
  fs.mkdirSync(isolatedDotnet);
  const verifyOutput = run(setupPath, ["--verify-payload"], {
    cwd: bundleRoot,
    env: { ...process.env, DOTNET_ROOT_X64: isolatedDotnet, DOTNET_MULTILEVEL_LOOKUP: "0" }
  });
  const verification = JSON.parse(verifyOutput.trim().split(/\r?\n/u).at(-1));
  if (verification.status !== "verified" || verification.files !== 18
      || verification.systemChangesPerformed !== false) {
    throw new Error(`Packaged capability payload verification did not pass: ${JSON.stringify(verification)}`);
  }
  const hash = sha256File(installerPath);
  console.log(JSON.stringify({
    status: "passed",
    artifact: path.basename(installerPath),
    artifactBytes: fs.statSync(installerPath).size,
    artifactSha256: hash,
    setupPackaged: true,
    setupSha256: packagedSetupSha256,
    payloadFiles: payloadEntries.length,
    nativeSetupWithoutInstalledDotnet: true,
    systemChangesPerformed: false
  }));
} finally {
  fs.rmSync(extractionRoot, { recursive: true, force: true });
}
