const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const testRoot = path.join(os.tmpdir(), `cap7ce-file-operation-${process.pid}-${Date.now()}`);
const userDataPath = path.join(testRoot, "user-data");
const sourceDirectory = path.join(testRoot, "sources");
const sourcePath = path.join(sourceDirectory, "delete-notes.txt");
const outsidePath = path.join(testRoot, "outside.txt");
const timestamp = new Date("2026-08-09T00:00:00.000Z").toISOString();

app.setPath("userData", userDataPath);

app.whenReady().then(async () => {
  try {
    await fs.mkdir(sourceDirectory, { recursive: true });
    await fs.writeFile(sourcePath, "cataloged non-visual file");
    await fs.writeFile(outsidePath, "outside file");

    const directory = {
      id: "file-operation-directory",
      name: "sources",
      path: sourceDirectory,
      indexedCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const { replaceDirectories } = require("../dist-electron/directoryStore.js");
    const { scanImageDirectories } = require("../dist-electron/imageScanner.js");
    const {
      ensureImageDatabase,
      findCatalogRecordFilePaths,
      writeScannedImagesToIndex
    } = require("../dist-electron/sqliteImageIndex.js");
    const { moveIndexedImagesToTrash } = require("../dist-electron/fileOperationService.js");

    await replaceDirectories([directory]);
    await ensureImageDatabase();
    const scan = await scanImageDirectories([directory]);
    await writeScannedImagesToIndex([directory.id], scan.images, scan.scannedAt, scan.files);
    assert.deepEqual(await findCatalogRecordFilePaths([sourcePath]), [sourcePath]);

    const deleteResult = await moveIndexedImagesToTrash([sourcePath]);
    assert.equal(deleteResult.success, true);
    assert.deepEqual(deleteResult.deletedPaths, [sourcePath]);
    await assert.rejects(() => fs.access(sourcePath));
    assert.deepEqual(await findCatalogRecordFilePaths([sourcePath]), []);

    const outsideResult = await moveIndexedImagesToTrash([outsidePath]);
    assert.equal(outsideResult.success, false);
    assert.equal(outsideResult.deletedPaths.length, 0);
    assert.equal(outsideResult.failedItems.length, 1);
    await fs.access(outsidePath);

    console.log(JSON.stringify({
      catalogedNonVisualFileTrashed: true,
      catalogRecordCleaned: true,
      outsideFileRejected: true
    }));
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
}).then(() => app.exit(0)).catch(async (error) => {
  console.error(error);
  await fs.rm(testRoot, { recursive: true, force: true }).catch(() => undefined);
  app.exit(1);
});
