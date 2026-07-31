const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const testRoot = path.join(os.tmpdir(), `cap7ce-skim-cache-${process.pid}-${Date.now()}`);
const userDataPath = path.join(testRoot, "user-data");
const sourcePath = path.join(testRoot, "sample.png");

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
    requestSkimVisualCache
  } = require("../dist-electron/skimVisualCacheService.js");

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );

  try {
    await fs.mkdir(testRoot, { recursive: true });
    await fs.writeFile(sourcePath, png);
    await initializeVisualCacheDirectories();

    const formalEntry = await createVisualCacheEntry(sourcePath, "search-thumbnail");
    await writeVisualCacheEntry(formalEntry, png, "image/png");

    assert.equal(beginSkimVisualSession("session-one"), true);
    const [thumbnailPath, previewPath] = await Promise.all([
      requestSkimVisualCache("session-one", sourcePath, "thumbnail"),
      requestSkimVisualCache("session-one", sourcePath, "preview")
    ]);
    assert.equal(path.dirname(thumbnailPath), getVisualCacheDirectory("skim-thumbnail"));
    assert.equal(path.dirname(previewPath), getVisualCacheDirectory("skim-preview"));
    assert.equal(isCap7CECachePath(thumbnailPath), true);

    const thumbnailEntry = await createVisualCacheEntry(sourcePath, "skim-thumbnail");
    const previewEntry = await createVisualCacheEntry(sourcePath, "skim-preview");
    assert.equal(path.dirname(thumbnailEntry.metadataPath), getVisualCacheMetadataDirectory("skim-thumbnail"));
    assert.equal(path.dirname(previewEntry.metadataPath), getVisualCacheMetadataDirectory("skim-preview"));

    const initialStats = await getSkimCacheStats();
    assert.equal(initialStats.cacheCount, 2);
    assert.ok(initialStats.totalBytes > 0);
    assert.ok(initialStats.cachePaths.every((cachePath) => cachePath.includes("skim-cache")));

    await clearVisualCaches();
    await assert.rejects(() => fs.access(formalEntry.imagePath));
    assert.equal((await getSkimCacheStats()).cacheCount, 2);
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
    await fs.access(formalEntry.imagePath);

    console.log(JSON.stringify({
      independentDirectories: true,
      thumbnailAndPreviewGenerated: true,
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
