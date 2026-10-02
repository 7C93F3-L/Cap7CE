const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const {
  ComputerSearchCapabilityController, buildCapabilitySetupArguments,
  hasRequiredCoreRuntime, parseFixedNtfsVolumes
} = require("../dist-electron/computerSearchCapability.js");
const { ComputerSearchRuntimeInstaller } = require("../dist-electron/computerSearchRuntimeInstaller.js");

const idleRuntimeInstall = { phase: "idle", receivedBytes: 0, totalBytes: null };

assert.equal(hasRequiredCoreRuntime(["8.0.31", "10.0.11"]), false);
assert.equal(hasRequiredCoreRuntime(["10.0.12"]), true);
assert.equal(hasRequiredCoreRuntime(["10.1.0-preview.1"]), true);
assert.deepEqual(parseFixedNtfsVolumes(JSON.stringify([
  { DriveLetter: "E", FileSystemLabel: "Assets", Size: 2000, SizeRemaining: 800 },
  { DriveLetter: "c", FileSystemLabel: "System", Size: 1000, SizeRemaining: 300 },
  { DriveLetter: "?", FileSystemLabel: "Invalid", Size: 1, SizeRemaining: 1 }
])), [
  { driveLetter: "C", label: "System", sizeBytes: 1000, freeBytes: 300 },
  { driveLetter: "E", label: "Assets", sizeBytes: 2000, freeBytes: 800 }
]);
assert.deepEqual(buildCapabilitySetupArguments({
  action: "enable", volumeLetters: ["C", "E"], removeCatalog: false
}), ["--activation-coordinator", "--action", "enable", "--catalog", "preserve", "--volumes", "C,E"]);
assert.deepEqual(buildCapabilitySetupArguments({
  action: "remove", volumeLetters: [], removeCatalog: true
}), ["--activation-coordinator", "--action", "remove", "--catalog", "remove"]);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cap7ce-core-capability-"));
const setupDirectory = path.join(temporaryRoot, "core-capability", "v1");
fs.mkdirSync(setupDirectory, { recursive: true });
fs.writeFileSync(path.join(setupDirectory, "Cap7CE.Core.Setup.exe"), "fixture");

const run = async () => {
  const calls = [];
  const controller = new ComputerSearchCapabilityController({
    packaged: true,
    resourcesPath: temporaryRoot,
    detectRuntime: async () => true,
    discoverVolumes: async () => [{ driveLetter: "E", label: "Assets", sizeBytes: 2, freeBytes: 1 }],
    runSetup: async (setupPath, args) => { calls.push({ setupPath, args }); return { exitCode: 0, output: "" }; }
  });
  assert.deepEqual(await controller.status(), {
    bundleAvailable: true, runtimeReady: true, busy: false,
    volumes: [{ driveLetter: "E", label: "Assets", sizeBytes: 2, freeBytes: 1 }],
    runtimeInstall: idleRuntimeInstall
  });
  assert.equal((await controller.configure({
    action: "enable", volumeLetters: ["E"], removeCatalog: false
  })).status, "completed");
  assert.deepEqual(calls[0].args, [
    "--activation-coordinator", "--action", "enable", "--catalog", "preserve", "--volumes", "E"
  ]);

  if (process.platform === "win32") {
    const realDiscoveryController = new ComputerSearchCapabilityController({
      packaged: true,
      resourcesPath: temporaryRoot,
      detectRuntime: async () => true
    });
    const realDiscovery = await realDiscoveryController.status();
    assert.ok(realDiscovery.volumes.length > 0,
      "the default Windows discovery chain must return at least the fixed NTFS system volume");
    assert.ok(realDiscovery.volumes.every((volume) => /^[A-Z]$/.test(volume.driveLetter)));
  }

  const missingRuntime = new ComputerSearchCapabilityController({
    packaged: true, resourcesPath: temporaryRoot, detectRuntime: async () => false,
    discoverVolumes: async () => [],
    runtimeInstaller: {
      getState: () => idleRuntimeInstall,
      install: async () => "restart-required"
    },
    runSetup: async () => { throw new Error("must not run"); }
  });
  assert.deepEqual(await missingRuntime.configure({
    action: "repair", volumeLetters: ["C"], removeCatalog: false
  }), { status: "restart-required", reason: "runtime-restart-required" });

  const runtimePayload = Buffer.from("fixed-runtime-installer-fixture");
  const runtimeDirectory = path.join(temporaryRoot, "runtime-download");
  let runtimeReady = false;
  const runtimeInstaller = new ComputerSearchRuntimeInstaller({
    rootDirectory: runtimeDirectory,
    installerUrl: "https://example.invalid/fixed-runtime.exe",
    installerSha512: createHash("sha512").update(runtimePayload).digest("hex"),
    detectRuntime: async () => runtimeReady,
    fetchDownload: async () => new Response(runtimePayload, {
      status: 200, headers: { "content-length": String(runtimePayload.length) }
    }),
    runInstaller: async (installerPath) => {
      assert.equal(fs.readFileSync(installerPath, "utf8"), runtimePayload.toString("utf8"));
      runtimeReady = true;
      return 0;
    }
  });
  assert.equal(await runtimeInstaller.install(), "ready");
  assert.equal(runtimeInstaller.getState().phase, "ready");
  assert.equal(fs.existsSync(path.join(runtimeDirectory, "dotnet-runtime-10.0.12-win-x64.exe")), false);

  const restartInstaller = new ComputerSearchRuntimeInstaller({
    rootDirectory: path.join(temporaryRoot, "runtime-restart"),
    installerUrl: "https://example.invalid/fixed-runtime.exe",
    installerSha512: createHash("sha512").update(runtimePayload).digest("hex"),
    detectRuntime: async () => true,
    fetchDownload: async () => new Response(runtimePayload, { status: 200 }),
    runInstaller: async () => 3010
  });
  assert.equal(await restartInstaller.install(), "ready",
    "an already available runtime must not launch the installer");

  let restartRuntimeReady = false;
  const restartRequiredInstaller = new ComputerSearchRuntimeInstaller({
    rootDirectory: path.join(temporaryRoot, "runtime-restart-required"),
    installerUrl: "https://example.invalid/fixed-runtime.exe",
    installerSha512: createHash("sha512").update(runtimePayload).digest("hex"),
    detectRuntime: async () => restartRuntimeReady,
    fetchDownload: async () => new Response(runtimePayload, { status: 200 }),
    runInstaller: async () => { restartRuntimeReady = true; return 3010; }
  });
  assert.equal(await restartRequiredInstaller.install(), "restart-required");
  assert.equal(restartRequiredInstaller.getState().phase, "restart-required");

  console.log(JSON.stringify({ capabilityBundleValidated: true, fixedNtfsVolumesValidated: true,
    defaultWindowsVolumeDiscoveryValidated: process.platform === "win32",
    runtimeBoundaryValidated: true, runtimeDownloadDigestValidated: true,
    arbitrarySetupArgumentsRejectedByIpc: true, systemChangesPerformed: false }));
};

run().finally(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  .catch((error) => { console.error(error); process.exitCode = 1; });
