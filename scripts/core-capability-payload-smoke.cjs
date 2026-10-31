const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") throw new Error("Core capability payload smoke requires Windows.");
const root = path.resolve(__dirname, "..");
const outputRoot = path.join(root, "core/artifacts/product-capability/v1");
const bundleRoot = path.join(outputRoot, "bundle");
const executable = path.join(bundleRoot, "Cap7CE.Core.Setup.exe");
const manifest = JSON.parse(fs.readFileSync(
  path.join(outputRoot, "capability-payload-manifest.v1.json"), "utf8"));
const topLevel = fs.readdirSync(bundleRoot).sort();
if (JSON.stringify(topLevel) !== JSON.stringify(["Cap7CE.Core.Setup.exe", "payload"])) {
  throw new Error(`Capability bundle top-level drifted: ${topLevel.join(", ")}`);
}
const requireX64Pe = (filePath) => {
  const image = fs.readFileSync(filePath);
  const peOffset = image.readUInt32LE(0x3c);
  if (image.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0"
      || image.readUInt16LE(peOffset + 4) !== 0x8664) {
    throw new Error(`${path.basename(filePath)} is not an x64 PE image.`);
  }
};
requireX64Pe(executable);
requireX64Pe(path.join(bundleRoot, "payload", "core", "Cap7CE.Core.Host.exe"));
requireX64Pe(path.join(bundleRoot, "payload", "reader", "Cap7CE.Core.Reader.Host.exe"));
const coreHost = path.join(bundleRoot, "payload", "core", "Cap7CE.Core.Host.exe");
const nativeDependencyRun = spawnSync(coreHost, ["--catalog-native-dependency-probe"], {
  encoding: "utf8", env: process.env, windowsHide: true
});
const nativeDependency = JSON.parse(nativeDependencyRun.stdout.trim());
if (nativeDependencyRun.status !== 0 || nativeDependencyRun.stderr !== ""
    || nativeDependency.status !== "passed" || nativeDependency.inMemory !== true
    || nativeDependency.sourceFilesRead !== false) {
  throw new Error("Bundled Core native SQLite dependency probe failed.");
}
const environment = { ...process.env, DOTNET_ROOT_X64: "C:\\nonexistent-cap7ce-runtime", DOTNET_MULTILEVEL_LOOKUP: "0" };
const run = (program) => spawnSync(program, ["--verify-payload"], {
  encoding: "utf8", env: environment, windowsHide: true
});
const verifiedRun = run(executable);
const verified = JSON.parse(verifiedRun.stdout.trim());
if (verifiedRun.status !== 0 || verifiedRun.stderr !== "" || verified.status !== "verified"
    || verified.reason !== "payload-verified" || verified.files !== manifest.files.length
    || verified.systemChangesPerformed !== false) throw new Error("Capability payload verification failed.");

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cap7ce-capability-payload-"));
try {
  const damagedBundle = path.join(temporaryRoot, "bundle");
  fs.cpSync(bundleRoot, damagedBundle, { recursive: true });
  const firstFile = manifest.files[0];
  const damagedPath = path.join(damagedBundle, "payload", firstFile.component,
    ...firstFile.relativePath.split("/"));
  fs.appendFileSync(damagedPath, Buffer.from([0]));
  const damagedRun = run(path.join(damagedBundle, "Cap7CE.Core.Setup.exe"));
  const damaged = JSON.parse(damagedRun.stdout.trim());
  if (damagedRun.status !== 2 || damaged.reason !== "payload-file-length-mismatch"
      || damaged.systemChangesPerformed !== false) throw new Error("Damaged payload was not rejected.");

  fs.rmSync(damagedBundle, { recursive: true, force: true });
  fs.cpSync(bundleRoot, damagedBundle, { recursive: true });
  fs.writeFileSync(path.join(damagedBundle, "payload", "reader", "unlisted.bin"), "unlisted");
  const unlistedRun = run(path.join(damagedBundle, "Cap7CE.Core.Setup.exe"));
  const unlisted = JSON.parse(unlistedRun.stdout.trim());
  if (unlistedRun.status !== 2 || unlisted.reason !== "payload-unlisted-file"
      || unlisted.systemChangesPerformed !== false) throw new Error("Unlisted payload file was not rejected.");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log(JSON.stringify({ status: "passed", nativeAot: true, installedDotnetRequired: false,
  payloadFiles: verified.files, payloadBytes: verified.bytes, tamperRejected: true,
  unlistedFileRejected: true, nativeSqliteLoaded: true, sourceFilesRead: false,
  systemChangesPerformed: false }));
