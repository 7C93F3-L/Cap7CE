const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { app } = require("electron");

const testRoot = path.join(os.tmpdir(), `cap7ce-thumbnail-optimization-${process.pid}-${Date.now()}`);
app.setPath("userData", path.join(testRoot, "user-data"));

const waitFor = async (predicate, timeoutMs = 5000) => {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) throw new Error("Timed out waiting for thumbnail optimization.");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

const candidateFor = async (filePath) => {
  const stats = await fs.stat(filePath);
  return {
    filePath,
    fileName: path.basename(filePath),
    fileSize: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    modifiedMs: stats.mtimeMs
  };
};

app.whenReady().then(async () => {
  const service = require("../dist-electron/thumbnailOptimizationService.js");
  const thumbnailService = require("../dist-electron/thumbnailService.js");
  const lifecycleEvents = [];
  const stopLifecycleListener = thumbnailService.onThumbnailLifecycle((event) => lifecycleEvents.push(event));
  const stopThrowingListener = thumbnailService.onThumbnailLifecycle(() => { throw new Error("observer failure"); });
  await fs.mkdir(testRoot, { recursive: true });
  const backgroundFile = path.join(testRoot, "background.png");
  const preexistingFile = path.join(testRoot, "preexisting.png");
  const foregroundPausedFile = path.join(testRoot, "foreground-paused.png");
  const pausedFile = path.join(testRoot, "paused.png");
  const deletedDirectory = path.join(testRoot, "deleted-directory");
  const deletedDirectoryFile = path.join(deletedDirectory, "deleted.png");
  const retainedFile = path.join(testRoot, "retained.png");
  const cancelledRenderFile = path.join(deletedDirectory, "cancelled-render.png");
  const activeRenderFile = path.join(testRoot, "active-render.png");
  const failedFile = path.join(testRoot, "failed.png");
  await fs.mkdir(deletedDirectory, { recursive: true });
  await Promise.all([
    sharp({ create: { width: 8, height: 8, channels: 4, background: "#336699" } }).png().toFile(backgroundFile),
    sharp({ create: { width: 8, height: 8, channels: 4, background: "#4477aa" } }).png().toFile(preexistingFile),
    sharp({ create: { width: 8, height: 8, channels: 4, background: "#335599" } }).png().toFile(foregroundPausedFile),
    sharp({ create: { width: 8, height: 8, channels: 4, background: "#996633" } }).png().toFile(pausedFile),
    sharp({ create: { width: 8, height: 8, channels: 4, background: "#663399" } }).png().toFile(deletedDirectoryFile),
    sharp({ create: { width: 8, height: 8, channels: 4, background: "#339966" } }).png().toFile(retainedFile),
    sharp({ create: { width: 8, height: 8, channels: 4, background: "#993366" } }).png().toFile(cancelledRenderFile),
    sharp({ create: { width: 8, height: 8, channels: 4, background: "#669933" } }).png().toFile(activeRenderFile)
  ]);
  await fs.writeFile(failedFile, "not-a-png");

  try {
    await thumbnailService.ensureThumbnailPath(preexistingFile);
    const preexistingAvailabilityCount = lifecycleEvents.filter((event) => (
      event.kind === "available" && event.filePath === preexistingFile
    )).length;
    await service.setThumbnailOptimizationEnabled(true);
    service.setThumbnailOptimizationForegroundActive(false);
    const preexistingCandidate = await candidateFor(preexistingFile);
    await service.enqueueThumbnailOptimizationCandidates([preexistingCandidate]);
    await waitFor(() => lifecycleEvents.filter((event) => (
      event.kind === "available" && event.filePath === preexistingFile
    )).length > preexistingAvailabilityCount);
    const discoveredAvailabilityCount = lifecycleEvents.length;
    await service.enqueueThumbnailOptimizationCandidates([preexistingCandidate]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(lifecycleEvents.length, discoveredAvailabilityCount, "the same cached identity is announced only once per process");

    await service.enqueueThumbnailOptimizationCandidates([await candidateFor(backgroundFile)]);
    await waitFor(() => service.getThumbnailOptimizationStatus().phase === "completed");
    assert.equal(service.getThumbnailOptimizationStatus().processedCount, 1);
    await waitFor(() => lifecycleEvents.some((event) => event.kind === "available" && event.filePath === backgroundFile));
    const firstAvailabilityCount = lifecycleEvents.length;
    await service.enqueueThumbnailOptimizationCandidates([await candidateFor(backgroundFile)]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(lifecycleEvents.length, firstAvailabilityCount, "generated representatives are not re-announced by later searches");
    assert.equal(service.getThumbnailOptimizationStatus().processedCount, 1, "cached representatives are not re-rendered");

    await service.setThumbnailOptimizationEnabled(false);
    await service.setThumbnailOptimizationEnabled(true);
    service.setThumbnailOptimizationForegroundActive(true);
    await service.enqueueThumbnailOptimizationCandidates([await candidateFor(foregroundPausedFile)]);
    await waitFor(() => service.getThumbnailOptimizationStatus().phase === "completed");
    assert.equal(service.getThumbnailOptimizationStatus().queuedCount, 0);
    assert.equal(service.getThumbnailOptimizationStatus().processedCount, 1);
    service.setThumbnailOptimizationForegroundActive(false);

    await service.setThumbnailOptimizationEnabled(false);
    await service.setThumbnailOptimizationEnabled(true);
    const firstFailedCandidate = await candidateFor(failedFile);
    await service.enqueueThumbnailOptimizationCandidates([firstFailedCandidate]);
    await waitFor(() => service.getThumbnailOptimizationStatus().phase === "completed");
    assert.equal(service.getThumbnailOptimizationStatus().processedCount, 1);
    assert.equal(service.getThumbnailOptimizationStatus().failedCount, 1);

    await service.enqueueThumbnailOptimizationCandidates([firstFailedCandidate]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(service.getThumbnailOptimizationStatus().phase, "completed");
    assert.equal(service.getThumbnailOptimizationStatus().processedCount, 1);
    assert.equal(service.getThumbnailOptimizationStatus().failedCount, 1);

    await fs.writeFile(failedFile, "still-not-a-valid-png");
    await service.enqueueThumbnailOptimizationCandidates([await candidateFor(failedFile)]);
    await waitFor(() => service.getThumbnailOptimizationStatus().processedCount === 2);
    assert.equal(service.getThumbnailOptimizationStatus().failedCount, 2);

    await service.setThumbnailOptimizationEnabled(false);
    await service.setThumbnailOptimizationEnabled(true);
    await service.enqueueThumbnailOptimizationCandidates([await candidateFor(failedFile)]);
    await waitFor(() => service.getThumbnailOptimizationStatus().phase === "completed");
    assert.equal(service.getThumbnailOptimizationStatus().processedCount, 1);
    assert.equal(service.getThumbnailOptimizationStatus().failedCount, 1);

    await service.setThumbnailOptimizationEnabled(false);
    await service.setThumbnailOptimizationEnabled(true);
    await service.pauseThumbnailOptimization("test-conflict");
    await service.enqueueThumbnailOptimizationCandidates([await candidateFor(pausedFile)]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(service.getThumbnailOptimizationStatus().queuedCount, 1);
    assert.equal(service.getThumbnailOptimizationStatus().processedCount, 0);
    service.resumeThumbnailOptimization("test-conflict");
    await waitFor(() => service.getThumbnailOptimizationStatus().phase === "completed");
    assert.equal(service.getThumbnailOptimizationStatus().processedCount, 1);

    await service.setThumbnailOptimizationEnabled(false);
    await service.setThumbnailOptimizationEnabled(true);
    await service.pauseThumbnailOptimization("test-directory-delete");
    await service.enqueueThumbnailOptimizationCandidates([
      await candidateFor(deletedDirectoryFile),
      await candidateFor(retainedFile)
    ]);
    assert.equal(service.getThumbnailOptimizationStatus().queuedCount, 2);
    service.discardThumbnailOptimizationCandidatesForDirectory(deletedDirectory);
    assert.equal(service.getThumbnailOptimizationStatus().queuedCount, 1);
    service.resumeThumbnailOptimization("test-directory-delete");
    await waitFor(() => service.getThumbnailOptimizationStatus().phase === "completed");
    assert.equal(service.getThumbnailOptimizationStatus().processedCount, 1);

    await service.setThumbnailOptimizationEnabled(false);
    await thumbnailService.pauseThumbnailRendering("test-directory-delete");
    const cancelledRender = thumbnailService.ensureThumbnailPath(cancelledRenderFile);
    thumbnailService.discardQueuedThumbnailRendersForDirectory(deletedDirectory);
    await assert.rejects(cancelledRender, (error) => error?.code === "ECANCELED");
    thumbnailService.resumeThumbnailRendering("test-directory-delete");

    const activeRender = thumbnailService.ensureThumbnailPath(activeRenderFile);
    await thumbnailService.pauseThumbnailRendering("test-cache-clear");
    await activeRender;
    thumbnailService.discardAllQueuedThumbnailRenders();
    await thumbnailService.clearAllVisualCaches();
    thumbnailService.resumeThumbnailRendering("test-cache-clear");
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal((await thumbnailService.getAllVisualCacheStats()).cacheCount, 0);

    console.log(JSON.stringify({
      backgroundQueueContinues: true,
      cachedRepresentativesAnnouncedOnce: true,
      foregroundFocusThrottlesQueue: true,
      foregroundBlurResumesQueue: true,
      unchangedFailuresSuppressedPerSession: true,
      changedFailuresRetried: true,
      manualReenableRetriesFailures: true,
      explicitPauseStillBlocks: true,
      resumeCompletesQueue: true,
      deletedDirectoryCandidatesDiscarded: true,
      unrelatedDirectoryCandidatesPreserved: true,
      queuedDirectoryRendersCancelled: true,
      cacheClearWaitedForActiveRenders: true
    }));
  } finally {
    stopLifecycleListener();
    stopThrowingListener();
    await service.setThumbnailOptimizationEnabled(false);
    await fs.rm(testRoot, { recursive: true, force: true });
    app.quit();
  }
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
