const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const testRoot = path.join(os.tmpdir(), `cap7ce-skim-cache-${process.pid}-${Date.now()}`);
const userDataPath = path.join(testRoot, "user-data");
const sourcePath = path.join(testRoot, "sample.png");
const shellSourcePath = path.join(testRoot, "sample.blend");

app.setPath("userData", userDataPath);

app.whenReady().then(async () => {
  const {
    createVisualCacheEntry,
    clearVisualCaches,
    getVisualCacheDirectory,
    getVisualCacheMetadataDirectory,
    initializeVisualCacheDirectories,
    isCap7CECachePath,
    writeVisualCacheEntry
  } = require("../dist-electron/visualCacheService.js");
  const {
    beginSkimVisualSession,
    cancelSkimVisualSession,
    clearSkimCacheSafely,
    getSkimCacheStats,
    requestSkimShellThumbnailCache,
    requestSkimVisualCache,
    setSkimShellThumbnailActivity
  } = require("../dist-electron/skimVisualCacheService.js");
  const { createShellThumbnailProvider } = require("../dist-electron/shellThumbnailProvider.js");
  const { ShellThumbnailScheduler } = require("../dist-electron/shellThumbnailScheduler.js");
  const { SHELL_THUMBNAIL_POLICY_VERSION } = require("../dist-electron/versioning.js");

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );

  try {
    await fs.mkdir(testRoot, { recursive: true });
    await fs.writeFile(sourcePath, png);
    await fs.writeFile(shellSourcePath, png);
    await initializeVisualCacheDirectories();

    const formalEntry = await createVisualCacheEntry(sourcePath, "search-thumbnail");
    await writeVisualCacheEntry(formalEntry, png, "image/png");

    assert.equal(beginSkimVisualSession("session-one"), true);
    setSkimShellThumbnailActivity(true);
    const [thumbnailPath, previewPath] = await Promise.all([
      requestSkimVisualCache("session-one", sourcePath, "thumbnail"),
      requestSkimVisualCache("session-one", sourcePath, "preview")
    ]);
    assert.equal(path.dirname(thumbnailPath), getVisualCacheDirectory("skim-thumbnail"));
    assert.equal(path.dirname(previewPath), getVisualCacheDirectory("skim-preview"));
    assert.equal(isCap7CECachePath(thumbnailPath), true);

    const thumbnailEntry = await createVisualCacheEntry(sourcePath, "skim-thumbnail");
    const previewEntry = await createVisualCacheEntry(sourcePath, "skim-preview");
    const shellEntry = await createVisualCacheEntry(shellSourcePath, "skim-shell-thumbnail");
    assert.equal(path.dirname(thumbnailEntry.metadataPath), getVisualCacheMetadataDirectory("skim-thumbnail"));
    assert.equal(path.dirname(previewEntry.metadataPath), getVisualCacheMetadataDirectory("skim-preview"));
    assert.equal(path.dirname(shellEntry.imagePath), getVisualCacheDirectory("skim-shell-thumbnail"));
    assert.equal(shellEntry.renderSource, "shell");
    assert.equal(shellEntry.shellThumbnailPolicyVersion, SHELL_THUMBNAIL_POLICY_VERSION);

    let providerCalls = 0;
    const shellProvider = createShellThumbnailProvider({
      createThumbnail: async () => {
        providerCalls += 1;
        return require("electron").nativeImage.createFromBuffer(png);
      },
      timeoutMs: 1000
    });
    const [shellCachePath, duplicateShellCachePath] = await Promise.all([
      shellProvider.ensureThumbnailPath(shellSourcePath),
      shellProvider.ensureThumbnailPath(shellSourcePath)
    ]);
    assert.equal(shellCachePath, duplicateShellCachePath);
    assert.equal(providerCalls, 1);
    assert.equal(await shellProvider.ensureThumbnailPath(shellSourcePath), shellCachePath);
    assert.equal(providerCalls, 1);
    const shellMetadata = JSON.parse(await fs.readFile(shellEntry.metadataPath, "utf8"));
    assert.equal(shellMetadata.renderSource, "shell");
    assert.equal(shellMetadata.shellThumbnailPolicyVersion, SHELL_THUMBNAIL_POLICY_VERSION);

    const shellFuture = new Date(Date.now() + 3000);
    await fs.utimes(shellSourcePath, shellFuture, shellFuture);
    const changedShellCachePath = await shellProvider.ensureThumbnailPath(shellSourcePath);
    assert.notEqual(changedShellCachePath, shellCachePath);
    assert.equal(providerCalls, 2);

    let schedulerCalls = 0;
    let schedulerActive = 0;
    let schedulerMaximumActive = 0;
    const scheduler = new ShellThumbnailScheduler(async (filePath) => {
      schedulerCalls += 1;
      schedulerActive += 1;
      schedulerMaximumActive = Math.max(schedulerMaximumActive, schedulerActive);
      await new Promise((resolve) => setTimeout(resolve, 15));
      schedulerActive -= 1;
      if (filePath.endsWith("failure")) throw new Error("expected failure");
      return `${filePath}.cache`;
    });
    scheduler.beginSession("scheduler-session");
    const inactiveRequest = scheduler.request("scheduler-session", `${testRoot}\\inactive`);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(schedulerCalls, 0);
    scheduler.setActive(true);
    assert.equal(await inactiveRequest, `${testRoot}\\inactive.cache`);
    const duplicatePath = `${testRoot}\\duplicate`;
    const [duplicateOne, duplicateTwo] = await Promise.all([
      scheduler.request("scheduler-session", duplicatePath),
      scheduler.request("scheduler-session", duplicatePath)
    ]);
    assert.equal(duplicateOne, duplicateTwo);
    assert.equal(schedulerCalls, 2);
    await Promise.all([
      scheduler.request("scheduler-session", `${testRoot}\\serial-one`),
      scheduler.request("scheduler-session", `${testRoot}\\serial-two`)
    ]);
    assert.equal(schedulerMaximumActive, 1);
    await assert.rejects(() => scheduler.request("scheduler-session", `${testRoot}\\failure`), /expected failure/);
    const callsAfterFailure = schedulerCalls;
    await assert.rejects(
      () => scheduler.request("scheduler-session", `${testRoot}\\failure`),
      (error) => error?.code === "ESHELLUNAVAILABLE"
    );
    assert.equal(schedulerCalls, callsAfterFailure);
    scheduler.setActive(false);
    const cancelledQueuedRequest = scheduler.request("scheduler-session", `${testRoot}\\cancelled`);
    assert.equal(scheduler.cancelSession("scheduler-session"), true);
    await assert.rejects(() => cancelledQueuedRequest, (error) => error?.code === "ECANCELED");

    let timeoutSchedulerCalls = 0;
    const timeoutScheduler = new ShellThumbnailScheduler(async () => {
      timeoutSchedulerCalls += 1;
      throw Object.assign(new Error("expected timeout"), { code: "ETIMEDOUT" });
    });
    timeoutScheduler.beginSession("timeout-session");
    timeoutScheduler.setActive(true);
    await assert.rejects(
      () => timeoutScheduler.request("timeout-session", `${testRoot}\\timeout`),
      (error) => error?.code === "ETIMEDOUT"
    );
    await assert.rejects(
      () => timeoutScheduler.request("timeout-session", `${testRoot}\\after-timeout`),
      (error) => error?.code === "ESHELLUNAVAILABLE"
    );
    assert.equal(timeoutSchedulerCalls, 1);

    let releaseLateTask;
    let lateTaskStarted;
    const lateTaskStartedPromise = new Promise((resolve) => {
      lateTaskStarted = resolve;
    });
    const lateScheduler = new ShellThumbnailScheduler(async (filePath) => {
      lateTaskStarted();
      await new Promise((resolve) => {
        releaseLateTask = resolve;
      });
      return `${filePath}.cache`;
    });
    lateScheduler.beginSession("late-session");
    lateScheduler.setActive(true);
    const lateRequest = lateScheduler.request("late-session", `${testRoot}\\late`);
    const lateRejection = assert.rejects(() => lateRequest, (error) => error?.code === "ECANCELED");
    await lateTaskStartedPromise;
    assert.equal(lateScheduler.cancelSession("late-session"), true);
    releaseLateTask();
    await lateRejection;

    const shellPathThroughSession = await requestSkimShellThumbnailCache("session-one", sourcePath);
    assert.equal(path.dirname(shellPathThroughSession), getVisualCacheDirectory("skim-shell-thumbnail"));

    const initialStats = await getSkimCacheStats();
    assert.equal(initialStats.cacheCount, 5);
    assert.ok(initialStats.totalBytes > 0);
    assert.ok(initialStats.cachePaths.every((cachePath) => cachePath.includes("skim-cache")));

    await clearVisualCaches();
    await assert.rejects(() => fs.access(formalEntry.imagePath));
    assert.equal((await getSkimCacheStats()).cacheCount, 5);
    await writeVisualCacheEntry(formalEntry, png, "image/png");

    const future = new Date(Date.now() + 2000);
    await fs.utimes(sourcePath, future, future);
    const changedThumbnailPath = await requestSkimVisualCache("session-one", sourcePath, "thumbnail");
    assert.notEqual(changedThumbnailPath, thumbnailPath);

    assert.equal(cancelSkimVisualSession("session-one"), true);
    await assert.rejects(
      () => requestSkimVisualCache("session-one", sourcePath, "thumbnail"),
      (error) => error?.code === "ECANCELED"
    );

    const clearedStats = await clearSkimCacheSafely();
    assert.deepEqual(clearedStats, {
      cacheCount: 0,
      totalBytes: 0,
      cachePaths: initialStats.cachePaths
    });
    await assert.rejects(() => fs.access(shellCachePath));
    await assert.rejects(() => fs.access(changedShellCachePath));
    await assert.rejects(() => fs.access(shellPathThroughSession));
    await fs.access(formalEntry.imagePath);

    console.log(JSON.stringify({
      independentDirectories: true,
      thumbnailAndPreviewGenerated: true,
      shellThumbnailCachedWithSourceAndPolicy: true,
      shellRequestsSerializedAndDeduplicated: true,
      shellFailuresDeduplicatedPerSession: true,
      shellQueuePausedAndCancelledWithSession: true,
      shellTimeoutCircuitBreakerVerified: true,
      shellSequentialCacheHitVerified: true,
      shellSourceChangeInvalidatedKey: true,
      cancelledShellSessionRejectedLateWork: true,
      shellClearRemovedAllShellEntries: true,
      metadataSeparated: true,
      sourceChangeInvalidatedKey: true,
      cancelledSessionRejectedLateWork: true,
      skimClearPreservedFormalCache: true,
      formalClearPreservedSkimCache: true
    }));
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
    app.quit();
  }
}).catch(async (error) => {
  console.error(error);
  await fs.rm(testRoot, { recursive: true, force: true });
  app.exit(1);
});
