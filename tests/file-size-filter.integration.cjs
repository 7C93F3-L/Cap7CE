const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const testRoot = path.join(os.tmpdir(), `cap7ce-file-size-filter-${process.pid}-${Date.now()}`);
const userDataPath = path.join(testRoot, "user-data");
const directoryPath = path.join(testRoot, "files");
const timestamp = new Date("2026-10-04T00:00:00.000Z").toISOString();
const mebibyte = 1024 * 1024;
const gibibyte = 1024 * mebibyte;

app.setPath("userData", userDataPath);

const directory = {
  id: "file-size-directory",
  name: "File size fixtures",
  path: directoryPath,
  indexedCount: 0,
  createdAt: timestamp,
  updatedAt: timestamp
};
const baseSearch = { query: "", directoryId: "all", fileFormat: "all", sortField: "file_name", sortDirection: "asc" };
const createSizedFile = async (name, size) => {
  const handle = await fs.open(path.join(directoryPath, name), "w");
  try { await handle.truncate(size); } finally { await handle.close(); }
};
const names = (response) => response.images.map((item) => item.fileName);

app.whenReady().then(async () => {
  try {
    await fs.mkdir(directoryPath, { recursive: true });
    await createSizedFile("a-under-1mb.txt", 512 * 1024);
    await createSizedFile("b-at-1mb.txt", mebibyte);
    await createSizedFile("c-at-10mb.txt", 10 * mebibyte);
    await createSizedFile("d-at-100mb.txt", 100 * mebibyte);
    await createSizedFile("e-at-1gb.txt", gibibyte);
    await createSizedFile("f-over-1gb.txt", gibibyte + 1);

    const { scanImageDirectories } = require("../dist-electron/imageScanner.js");
    const { ensureImageDatabase, searchIndexedCatalog, writeScannedImagesToIndex } = require("../dist-electron/sqliteImageIndex.js");
    const { searchImagesWithAddedDirectories } = require("../dist-electron/imageSearchService.js");
    const { searchScanSnapshotService } = require("../dist-electron/searchScanSnapshotService.js");
    await ensureImageDatabase();
    const initialScan = await scanImageDirectories([directory]);
    await writeScannedImagesToIndex([directory.id], initialScan.images, initialScan.scannedAt, initialScan.files);

    assert.deepEqual(names(await searchIndexedCatalog({ ...baseSearch, fileSizePreset: "under-1mb" }, [directory])), ["a-under-1mb.txt"]);
    assert.deepEqual(names(await searchIndexedCatalog({ ...baseSearch, fileSizePreset: "1mb-10mb" }, [directory])), ["b-at-1mb.txt"]);
    assert.deepEqual(names(await searchIndexedCatalog({ ...baseSearch, fileSizePreset: "10mb-100mb" }, [directory])), ["c-at-10mb.txt"]);
    assert.deepEqual(names(await searchIndexedCatalog({ ...baseSearch, fileSizePreset: "100mb-1gb" }, [directory])), ["d-at-100mb.txt"]);
    assert.deepEqual(names(await searchIndexedCatalog({ ...baseSearch, fileSizePreset: "1gb-or-more" }, [directory])), ["e-at-1gb.txt", "f-over-1gb.txt"]);
    assert.deepEqual(names(await searchIndexedCatalog({ ...baseSearch, fileSizeRange: { minBytes: 10 * mebibyte, maxBytes: 100 * mebibyte } }, [directory])), ["c-at-10mb.txt", "d-at-100mb.txt"]);

    await createSizedFile("b-at-1mb.txt", 12 * mebibyte);
    searchScanSnapshotService.invalidate([directory.id]);
    assert.deepEqual(
      names(await searchImagesWithAddedDirectories({ ...baseSearch, fileSizePreset: "10mb-100mb" }, [directory])),
      ["b-at-1mb.txt", "c-at-10mb.txt"],
      "live scan metadata should override a stale indexed file size"
    );

    console.log(JSON.stringify({ presetBoundariesVerified: true, customRangeVerified: true, liveScanSizeOverlayVerified: true }));
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
}).then(() => app.exit(0)).catch((error) => {
  console.error(error);
  app.exit(1);
});
