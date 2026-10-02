const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") throw new Error("Core product installer smoke requires Windows.");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const installerPath = path.join(root, "release", `Cap7CE-Setup-${packageJson.version}-x64.exe`);
const sourceBundle = path.join(root, "core", "artifacts", "product-capability", "v1", "bundle");
if (!fs.existsSync(installerPath)) throw new Error("The regular Cap7CE installer was not built.");
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
  const result = spawnSync(file, args, { cwd: root, encoding: "utf8", windowsHide: true,
    maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(file)} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
};
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const listFiles = (directory) => {
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) files.push(path.relative(directory, absolutePath));
    }
  };
  visit(directory);
  return files.sort();
};
const containsText = (buffer, value) => buffer.includes(Buffer.from(value, "utf16le"))
  || buffer.includes(Buffer.from(value));

const listing = run(sevenZip, ["l", "-ba", installerPath]).replaceAll("/", "\\").toLowerCase();
for (const required of [
  "resources\\core-capability\\v1\\cap7ce.core.setup.exe",
  "resources\\licenses\\core-dependencies\\license-mit",
  "resources\\licenses\\core-dependencies\\license-apache-2.0"
]) if (!listing.includes(required)) throw new Error(`Regular installer is missing ${required}.`);

const extractionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cap7ce-product-package-"));
try {
  run(sevenZip, ["x", "-y", `-o${extractionRoot}`, installerPath,
    "resources\\core-capability\\v1\\*", "resources\\licenses\\core-dependencies\\*"]);
  const packagedBundle = path.join(extractionRoot, "resources", "core-capability", "v1");
  const sourceFiles = listFiles(sourceBundle);
  const packagedFiles = listFiles(packagedBundle);
  if (JSON.stringify(packagedFiles) !== JSON.stringify(sourceFiles)) {
    throw new Error("Regular installer capability file set does not match the deterministic source bundle.");
  }
  for (const relativePath of sourceFiles) {
    if (sha256File(path.join(sourceBundle, relativePath))
        !== sha256File(path.join(packagedBundle, relativePath))) {
      throw new Error(`Regular installer capability digest mismatch: ${relativePath}`);
    }
  }
  const setupPath = path.join(packagedBundle, "Cap7CE.Core.Setup.exe");
  const setupContents = fs.readFileSync(setupPath);
  if (!containsText(setupContents, "Cap7CENtfsReader")
      || !containsText(setupContents, "cap7ce-ntfs-reader-v1")
      || containsText(setupContents, "Cap7CENtfsReaderP33b2Probe")) {
    throw new Error("Regular installer does not contain the isolated production capability identity.");
  }
  const isolatedDotnet = path.join(extractionRoot, "isolated-dotnet");
  fs.mkdirSync(isolatedDotnet);
  const verifyOutput = run(setupPath, ["--verify-payload"], { cwd: packagedBundle,
    env: { ...process.env, DOTNET_ROOT_X64: isolatedDotnet, DOTNET_MULTILEVEL_LOOKUP: "0" } });
  const verification = JSON.parse(verifyOutput.trim().split(/\r?\n/u).at(-1));
  if (verification.status !== "verified" || verification.files !== 18
      || verification.systemChangesPerformed !== false) {
    throw new Error(`Regular installer payload verification failed: ${JSON.stringify(verification)}`);
  }
  console.log(JSON.stringify({ status: "passed", artifact: path.basename(installerPath),
    artifactBytes: fs.statSync(installerPath).size, artifactSha256: sha256File(installerPath),
    capabilityFiles: sourceFiles.length, payloadFiles: verification.files,
    licenseTexts: 2, nativeSetupWithoutInstalledDotnet: true, systemChangesPerformed: false }));
} finally {
  fs.rmSync(extractionRoot, { recursive: true, force: true });
}
