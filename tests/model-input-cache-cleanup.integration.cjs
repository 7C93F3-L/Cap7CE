const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const testRoot = path.join(
  os.tmpdir(),
  `cap7ce-model-input-cleanup-${process.pid}-${Date.now()}`
);
const userDataPath = path.join(testRoot, "user-data");
const sourceDirectory = path.join(testRoot, "sources");

app.setPath("userData", userDataPath);

app.whenReady().then(async () => {
  const {
    ensureImageDatabase,
    updateImageRecognition,
    updateImageRecognitionFailure,
    writeScannedImagesToIndex
  } = require("../dist-electron/sqliteImageIndex.js");
  const {
    createVisualCacheEntry,
    initializeVisualCacheDirectories,
    writeVisualCacheEntry
  } = require("../dist-electron/visualCacheService.js");
  const {
    cleanupRecognizedModelInputCaches
  } = require("../dist-electron/modelInputCacheCleanupService.js");

  const sourcePaths = [
    path.join(sourceDirectory, "recognized.jpg"),
    path.join(sourceDirectory, "failed.jpg"),
    path.join(sourceDirectory, "pending.jpg")
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
    await updateImageRecognition(1, "recognized", ["tag"], indexedAt);
    await updateImageRecognitionFailure(2, "failed", indexedAt);

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

    const result = await cleanupRecognizedModelInputCaches();
    assert.deepEqual(result, {
      recognizedCount: 1,
      deletedCount: 1
    });

    const recognizedModelInput = cacheEntries.get(
      `${sourcePaths[0]}:model-input-image`
    );
    await assert.rejects(fs.access(recognizedModelInput.imagePath));
    await assert.rejects(fs.access(recognizedModelInput.metadataPath));

    for (const sourcePath of sourcePaths) {
      for (const cacheType of cacheTypes) {
        if (sourcePath === sourcePaths[0] && cacheType === "model-input-image") {
          continue;
        }
        const entry = cacheEntries.get(`${sourcePath}:${cacheType}`);
        await fs.access(entry.imagePath);
        await fs.access(entry.metadataPath);
      }
    }

    const repeatResult = await cleanupRecognizedModelInputCaches();
    assert.deepEqual(repeatResult, {
      recognizedCount: 1,
      deletedCount: 0
    });

    console.log(JSON.stringify({
      recognizedCount: result.recognizedCount,
      deletedCount: result.deletedCount,
      repeatDeletedCount: repeatResult.deletedCount,
      retainedFailedAndPending: 2
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
