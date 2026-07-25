const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const testRoot = path.join(
  os.tmpdir(),
  `cap7ce-stale-cleanup-${process.pid}-${Date.now()}`
);
const userDataPath = path.join(testRoot, "user-data");
const sourceDirectory = path.join(testRoot, "sources");

app.setPath("userData", userDataPath);

app.whenReady().then(async () => {
  const {
    ensureImageDatabase,
    listIndexedImageFilePaths,
    writeScannedImagesToIndex
  } = require("../dist-electron/sqliteImageIndex.js");
  const {
    createVisualCacheEntry,
    initializeVisualCacheDirectories,
    writeVisualCacheEntry
  } = require("../dist-electron/visualCacheService.js");
  const {
    cleanupMissingIndexedImages
  } = require("../dist-electron/staleImageCleanupService.js");

  const sourcePaths = [
    path.join(sourceDirectory, "existing.jpg"),
    path.join(sourceDirectory, "missing-a.webp"),
    path.join(sourceDirectory, "missing-b.png")
  ];
  const cacheTypes = [
    "search-thumbnail",
    "model-input-image",
    "preview-image"
  ];
  const cacheEntries = new Map();

  try {
    await fs.mkdir(sourceDirectory, { recursive: true });
    await Promise.all(sourcePaths.map((filePath) => fs.writeFile(filePath, "source")));
    await ensureImageDatabase();
    await initializeVisualCacheDirectories();

    const indexedAt = new Date().toISOString();
    await writeScannedImagesToIndex(
      ["test-directory"],
      sourcePaths.map((filePath) => ({
        directory_id: "test-directory",
        directory_path: sourceDirectory,
        file_path: filePath,
        file_name: path.basename(filePath),
        file_size: 6,
        created_at: indexedAt,
        modified_at: indexedAt
      })),
      indexedAt
    );

    for (const sourcePath of sourcePaths) {
      for (const cacheType of cacheTypes) {
        const entry = await createVisualCacheEntry(sourcePath, cacheType);
        await writeVisualCacheEntry(
          entry,
          Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
          "image/jpeg"
        );
        cacheEntries.set(`${sourcePath}:${cacheType}`, entry);
      }
    }

    await fs.rm(sourcePaths[1]);
    await fs.rm(sourcePaths[2]);

    const result = await cleanupMissingIndexedImages();
    assert.equal(result.checkedCount, 3);
    assert.deepEqual(
      new Set(result.removedFilePaths),
      new Set([sourcePaths[1], sourcePaths[2]])
    );
    assert.deepEqual(result.errors, []);
    assert.deepEqual(await listIndexedImageFilePaths(), [sourcePaths[0]]);

    for (const cacheType of cacheTypes) {
      const existingEntry = cacheEntries.get(`${sourcePaths[0]}:${cacheType}`);
      await fs.access(existingEntry.imagePath);
      await fs.access(existingEntry.metadataPath);

      for (const removedSourcePath of sourcePaths.slice(1)) {
        const removedEntry = cacheEntries.get(`${removedSourcePath}:${cacheType}`);
        await assert.rejects(fs.access(removedEntry.imagePath));
        await assert.rejects(fs.access(removedEntry.metadataPath));
      }
    }

    const repeatResult = await cleanupMissingIndexedImages();
    assert.equal(repeatResult.checkedCount, 1);
    assert.deepEqual(repeatResult.removedFilePaths, []);
    assert.deepEqual(repeatResult.errors, []);

    console.log(JSON.stringify({
      checkedCount: result.checkedCount,
      removedCount: result.removedFilePaths.length,
      retainedCount: (await listIndexedImageFilePaths()).length,
      cacheTypesVerified: cacheTypes.length,
      repeatCleanupRemovedCount: repeatResult.removedFilePaths.length
    }));
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
}).then(() => {
  app.exit(0);
}).catch(async (error) => {
  console.error(error);
  await fs.rm(testRoot, { recursive: true, force: true }).catch(() => undefined);
  app.exit(1);
});
