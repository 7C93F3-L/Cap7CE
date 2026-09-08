const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { AppUpdateDownloadError, AppUpdateDownloadService, resolveAppUpdateRootDirectory } = require("../dist-electron/appUpdateDownloadService.js");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const payload = Buffer.from("complete-cap7ce-installer-payload");
const asset = (version = "1.0.0", overrides = {}) => ({
  version,
  assetId: 1000 + Number(version.replaceAll(".", "")),
  assetName: `Cap7CE-Setup-${version}-x64.exe`,
  tagName: `v${version}`,
  uploadState: "uploaded",
  size: payload.length,
  digest: sha256(payload),
  downloadUrl: `https://github.com/7C93F3-L/Cap7CE/releases/download/v${version}/Cap7CE-Setup-${version}-x64.exe`,
  ...overrides
});
const finalPath = (root, candidate) => path.join(root, candidate.assetName);
const partialPath = (root, candidate) => `${finalPath(root, candidate)}.part`;
const waitFor = async (predicate, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;
  while (!await predicate()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for update state");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
const exists = async (target) => fs.access(target).then(() => true).catch(() => false);
const seedPartial = async (root, candidate, bytes, metadata = {}) => {
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(partialPath(root, candidate), bytes);
  await fs.writeFile(path.join(root, "update.json"), `${JSON.stringify({
    schemaVersion: 1,
    status: "partial",
    asset: candidate,
    receivedBytes: bytes.length,
    etag: '"asset-etag"',
    lastModified: null,
    ...metadata
  }, null, 2)}\n`);
};
const createService = (root, options = {}) => {
  const progress = [];
  const diagnostics = [];
  const opened = [];
  const installIntents = [];
  const service = new AppUpdateDownloadService({
    rootDirectory: root,
    currentVersion: options.currentVersion ?? "0.9.9",
    fetchDownload: options.fetchDownload,
    openInstaller: async (installerPath) => {
      opened.push(installerPath);
      return options.openError?.() ?? "";
    },
    onInstallerOpened: async (version) => { installIntents.push(version); },
    onProgress: (entry) => progress.push(entry),
    diagnostics: { log: (level, event, data = {}) => diagnostics.push({ level, event, data }) },
    inactivityTimeoutMs: options.inactivityTimeoutMs ?? 100,
    getAvailableDiskBytes: options.getAvailableDiskBytes ?? (async () => Number.MAX_SAFE_INTEGER)
  });
  return { service, progress, diagnostics, opened, installIntents };
};
const fullResponse = (bytes = payload, headers = {}) => new Response(bytes, {
  status: 200,
  headers: { "content-length": String(bytes.length), etag: '"asset-etag"', ...headers }
});
const resumeResponse = (bytes, start, total = payload.length, headers = {}) => new Response(bytes, {
  status: 206,
  headers: {
    "content-length": String(bytes.length),
    "content-range": `bytes ${start}-${start + bytes.length - 1}/${total}`,
    etag: '"asset-etag"',
    ...headers
  }
});

(async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-installer-update-"));
  try {
    assert.equal(resolveAppUpdateRootDirectory("C:\\Users\\Test\\AppData\\Local", "C:\\Fallback"), "C:\\Users\\Test\\AppData\\Local\\Cap7CE\\updates");

    const freshRoot = path.join(temporaryRoot, "fresh");
    const fresh = createService(freshRoot, { fetchDownload: async () => fullResponse() });
    await fresh.service.initialize();
    await fresh.service.setAvailableAsset(asset());
    assert.equal((await fresh.service.download()).status, "ready");
    assert.deepEqual(await fs.readFile(finalPath(freshRoot, asset())), payload);
    assert.equal(await exists(partialPath(freshRoot, asset())), false);
    assert.deepEqual(fresh.progress.map((entry) => entry.phase).filter((value, index, values) => index === 0 || value !== values[index - 1]), ["downloading", "verifying", "ready"]);

    const pauseRoot = path.join(temporaryRoot, "pause-resume");
    let pauseRequestHeaders;
    let firstStreamController;
    const stalledBody = new ReadableStream({
      start(controller) { firstStreamController = controller; controller.enqueue(payload.subarray(0, 7)); },
      cancel() {}
    });
    const paused = createService(pauseRoot, { fetchDownload: async () => new Response(stalledBody, { status: 200, headers: { "content-length": String(payload.length), etag: '"asset-etag"' } }) });
    await paused.service.initialize();
    await paused.service.setAvailableAsset(asset());
    const pausedDownload = paused.service.download();
    await waitFor(async () => (await fs.stat(partialPath(pauseRoot, asset())).catch(() => ({ size: 0 }))).size === 7);
    assert.equal(paused.service.pause(), true);
    await assert.rejects(pausedDownload, (error) => error instanceof AppUpdateDownloadError && error.code === "cancelled");
    firstStreamController = null;
    assert.equal(paused.service.getState().status, "resumable");

    const resumed = createService(pauseRoot, {
      fetchDownload: async (_url, init) => {
        pauseRequestHeaders = init.headers;
        return resumeResponse(payload.subarray(7), 7);
      }
    });
    await resumed.service.initialize();
    assert.equal(resumed.service.getState().status, "resumable", "partial download must survive a process restart");
    assert.equal((await resumed.service.download()).status, "ready");
    assert.equal(pauseRequestHeaders.Range, "bytes=7-");
    assert.equal(pauseRequestHeaders["If-Range"], '"asset-etag"');
    assert.deepEqual(await fs.readFile(finalPath(pauseRoot, asset())), payload);

    const networkRoot = path.join(temporaryRoot, "network");
    let networkReadCount = 0;
    const networkBody = new ReadableStream({
      pull(controller) {
        if (networkReadCount === 0) {
          networkReadCount += 1;
          controller.enqueue(payload.subarray(0, 5));
          return;
        }
        controller.error(new Error("connection lost"));
      }
    });
    const network = createService(networkRoot, { fetchDownload: async () => new Response(networkBody, { status: 200, headers: { "content-length": String(payload.length) } }) });
    await network.service.initialize();
    await network.service.setAvailableAsset(asset());
    await assert.rejects(network.service.download(), (error) => error.code === "network");
    assert.equal((await fs.stat(partialPath(networkRoot, asset()))).size, 5, "network interruption must preserve valid partial bytes");

    for (const [name, firstResponse] of [
      ["range-ignored", () => fullResponse()],
      ["wrong-range", () => resumeResponse(payload.subarray(6), 5)],
      ["range-416", () => new Response(null, { status: 416 })]
    ]) {
      const root = path.join(temporaryRoot, name);
      await seedPartial(root, asset(), payload.subarray(0, 6));
      let calls = 0;
      const harness = createService(root, {
        fetchDownload: async () => {
          calls += 1;
          return calls === 1 ? firstResponse() : fullResponse();
        }
      });
      await harness.service.initialize();
      assert.equal((await harness.service.download()).status, "ready");
      assert.deepEqual(await fs.readFile(finalPath(root, asset())), payload, `${name} must never concatenate unsafe bytes`);
      assert.equal(calls, name === "range-ignored" ? 1 : 2);
    }

    const incompleteRoot = path.join(temporaryRoot, "incomplete");
    const incompleteBytes = payload.subarray(0, payload.length - 2);
    const incomplete = createService(incompleteRoot, { fetchDownload: async () => new Response(incompleteBytes, { status: 200 }) });
    await incomplete.service.initialize();
    await incomplete.service.setAvailableAsset(asset());
    await assert.rejects(incomplete.service.download(), (error) => error.code === "incomplete");
    assert.equal(await exists(partialPath(incompleteRoot, asset())), true);

    const digestRoot = path.join(temporaryRoot, "digest");
    const wrongDigestAsset = asset("1.0.0", { digest: "0".repeat(64) });
    const digest = createService(digestRoot, { fetchDownload: async () => fullResponse() });
    await digest.service.initialize();
    await digest.service.setAvailableAsset(wrongDigestAsset);
    await assert.rejects(digest.service.download(), (error) => error.code === "invalid");
    assert.equal(await exists(partialPath(digestRoot, wrongDigestAsset)), false);
    assert.equal(await exists(path.join(digestRoot, "update.json")), false);

    const diskRoot = path.join(temporaryRoot, "disk");
    const disk = createService(diskRoot, { fetchDownload: async () => { throw new Error("must not fetch"); }, getAvailableDiskBytes: async () => payload.length - 1 });
    await disk.service.initialize();
    await disk.service.setAvailableAsset(asset());
    await assert.rejects(disk.service.download(), (error) => error.code === "disk_space");

    const busyRoot = path.join(temporaryRoot, "busy");
    const busyBody = new ReadableStream({ start() {}, cancel() {} });
    const busy = createService(busyRoot, { fetchDownload: async () => new Response(busyBody, { status: 200, headers: { "content-length": String(payload.length) } }), inactivityTimeoutMs: 5_000 });
    await busy.service.initialize();
    await busy.service.setAvailableAsset(asset());
    const activeDownload = busy.service.download();
    await waitFor(() => busy.service.isBusy());
    assert.equal((await busy.service.download()).status, "downloading", "duplicate download calls must share the active state");
    busy.service.pause();
    await assert.rejects(activeDownload, (error) => error.code === "cancelled");
    assert.equal(await busy.service.discard().then(() => true), true);
    assert.equal(await exists(partialPath(busyRoot, asset())), false);

    let openError = "blocked by test";
    const openHarness = createService(freshRoot, { openError: () => openError });
    await openHarness.service.initialize();
    assert.equal((await openHarness.service.openReadyInstaller()).status, "failed");
    assert.deepEqual(openHarness.installIntents, []);
    openError = "";
    assert.equal((await openHarness.service.openReadyInstaller()).status, "installing");
    assert.equal(openHarness.opened[0], finalPath(freshRoot, asset()));
    assert.deepEqual(openHarness.installIntents, ["1.0.0"]);

    const obsoleteRoot = path.join(temporaryRoot, "obsolete");
    await fs.mkdir(obsoleteRoot, { recursive: true });
    await fs.writeFile(path.join(obsoleteRoot, "Cap7CE-Setup-0.9.9-x64.exe"), "old");
    await fs.writeFile(path.join(obsoleteRoot, "Cap7CE-Setup-0.9.8-x64.exe.part"), "old");
    const obsolete = createService(obsoleteRoot);
    await obsolete.service.initialize();
    assert.deepEqual((await fs.readdir(obsoleteRoot)).filter((name) => name.startsWith("Cap7CE-Setup")), []);

    console.log(JSON.stringify({
      freshDownloadVerified: true,
      pauseAnd206ResumeVerified: true,
      networkPartialPreserved: true,
      crossRestartRestoreVerified: true,
      ignoredRangeSafelyRestarted: true,
      incorrectContentRangeSafelyRestarted: true,
      range416SafelyRestarted: true,
      sizeAndDigestFailuresVerified: true,
      diskSpaceGuardVerified: true,
      duplicateDownloadGuardVerified: true,
      discardCleanupVerified: true,
      installerOpenFailureAndSuccessVerified: true,
      obsoleteInstallerCleanupVerified: true
    }));
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
