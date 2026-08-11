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
  await fs.mkdir(testRoot, { recursive: true });
  const backgroundFile = path.join(testRoot, "background.png");
  const pausedFile = path.join(testRoot, "paused.png");
  await Promise.all([
    sharp({ create: { width: 8, height: 8, channels: 4, background: "#336699" } }).png().toFile(backgroundFile),
    sharp({ create: { width: 8, height: 8, channels: 4, background: "#996633" } }).png().toFile(pausedFile)
  ]);

  try {
    await service.setThumbnailOptimizationEnabled(true);
    service.setThumbnailOptimizationForegroundActive(false);
    await service.enqueueThumbnailOptimizationCandidates([await candidateFor(backgroundFile)]);
    await waitFor(() => service.getThumbnailOptimizationStatus().phase === "completed");
    assert.equal(service.getThumbnailOptimizationStatus().processedCount, 1);

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

    console.log(JSON.stringify({
      backgroundQueueContinues: true,
      explicitPauseStillBlocks: true,
      resumeCompletesQueue: true
    }));
  } finally {
    await service.setThumbnailOptimizationEnabled(false);
    await fs.rm(testRoot, { recursive: true, force: true });
    app.quit();
  }
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
