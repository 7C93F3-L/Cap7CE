const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const testRoot = path.join(os.tmpdir(), `cap7ce-multi-format-search-${process.pid}-${Date.now()}`);
const userDataPath = path.join(testRoot, "user-data");
const firstDirectoryPath = path.join(testRoot, "first");
const secondDirectoryPath = path.join(testRoot, "second");
const nestedPathOnlyDirectory = path.join(firstDirectoryPath, "path-only-token");
const timestamp = new Date("2026-07-31T00:00:00.000Z").toISOString();

app.setPath("userData", userDataPath);

const createDirectory = (id, name, directoryPath) => ({
  id,
  name,
  path: directoryPath,
  indexedCount: 0,
  createdAt: timestamp,
  updatedAt: timestamp
});

const baseSearch = {
  query: "",
  directoryId: "all",
  fileFormat: "all",
  sortField: "file_name",
  sortDirection: "asc",
  recognitionStatus: "all"
};

app.whenReady().then(async () => {
  try {
    await fs.mkdir(nestedPathOnlyDirectory, { recursive: true });
    await fs.mkdir(secondDirectoryPath, { recursive: true });
    await fs.writeFile(path.join(firstDirectoryPath, "visual.png"), "png");
    await fs.writeFile(path.join(firstDirectoryPath, "notes.txt"), "txt");
    await fs.writeFile(path.join(firstDirectoryPath, "brief.docx"), "docx");
    await fs.writeFile(path.join(firstDirectoryPath, "sound.mp3"), "mp3");
    await fs.writeFile(path.join(firstDirectoryPath, "ignored.exe"), "exe");
    await fs.writeFile(path.join(nestedPathOnlyDirectory, "plain.txt"), "plain");
    await fs.writeFile(path.join(secondDirectoryPath, "other.md"), "md");
    const orderedFiles = [
      path.join(firstDirectoryPath, "brief.docx"),
      path.join(firstDirectoryPath, "sound.mp3"),
      path.join(nestedPathOnlyDirectory, "plain.txt"),
      path.join(firstDirectoryPath, "notes.txt"),
      path.join(secondDirectoryPath, "other.md"),
      path.join(firstDirectoryPath, "visual.png")
    ];
    for (let index = 0; index < orderedFiles.length; index += 1) {
      const modifiedAt = new Date(`2026-07-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`);
      await fs.utimes(orderedFiles[index], modifiedAt, modifiedAt);
    }

    const firstDirectory = createDirectory("first-directory", "用户项目-Alpha", firstDirectoryPath);
    const secondDirectory = createDirectory("second-directory", "second", secondDirectoryPath);
    const directories = [firstDirectory, secondDirectory];
    const { scanImageDirectories } = require("../dist-electron/imageScanner.js");
    const {
      ensureImageDatabase,
      listPendingImageRecognitions,
      updateImageRecognition,
      writeScannedImagesToIndex
    } = require("../dist-electron/sqliteImageIndex.js");
    const { searchImagesWithAddedDirectories } = require("../dist-electron/imageSearchService.js");
    const { searchScanSnapshotService } = require("../dist-electron/searchScanSnapshotService.js");

    await ensureImageDatabase();
    const initialScan = await scanImageDirectories(directories);
    await writeScannedImagesToIndex(
      directories.map((directory) => directory.id),
      initialScan.images,
      initialScan.scannedAt,
      initialScan.files
    );
    const pendingVisual = (await listPendingImageRecognitions(10))[0];
    await updateImageRecognition(pendingVisual.id, "mountain reference", ["landscape"], timestamp);

    const allResults = await searchImagesWithAddedDirectories(baseSearch, directories);
    assert.deepEqual(allResults.images.map((item) => item.fileName), [
      "brief.docx",
      "notes.txt",
      "other.md",
      "plain.txt",
      "sound.mp3",
      "visual.png"
    ]);
    assert.equal(new Set(allResults.images.map((item) => item.filePath.toLowerCase())).size, allResults.images.length);
    assert.deepEqual(allResults.availableFormats, ["docx", "md", "mp3", "png", "txt"]);
    assert.equal(allResults.unrecognizedCount, 0);

    const nameDescending = await searchImagesWithAddedDirectories({
      ...baseSearch,
      sortDirection: "desc"
    }, directories);
    assert.deepEqual(nameDescending.images.map((item) => item.fileName), [
      "visual.png",
      "sound.mp3",
      "plain.txt",
      "other.md",
      "notes.txt",
      "brief.docx"
    ]);
    const modifiedDescending = await searchImagesWithAddedDirectories({
      ...baseSearch,
      sortField: "modified_at",
      sortDirection: "desc"
    }, directories);
    assert.deepEqual(modifiedDescending.images.map((item) => item.fileName), [
      "visual.png",
      "other.md",
      "notes.txt",
      "plain.txt",
      "sound.mp3",
      "brief.docx"
    ]);

    const notesResult = await searchImagesWithAddedDirectories({ ...baseSearch, query: "notes" }, directories);
    assert.deepEqual(notesResult.images.map((item) => item.fileName), ["notes.txt"]);
    assert.equal(notesResult.images[0].resultKind, "file");
    assert.equal(notesResult.images[0].iconName, "format-txt");
    assert.equal(notesResult.images[0].previewKind, "text");
    assert.equal(notesResult.images[0].thumbnailUrl, "");

    const pathOnlyQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "path-only-token" }, directories);
    assert.deepEqual(pathOnlyQuery.images.map((item) => item.fileName), ["plain.txt"]);

    const rootNameQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "first" }, directories);
    assert.deepEqual(rootNameQuery.images.map((item) => item.fileName), [
      "brief.docx",
      "notes.txt",
      "plain.txt",
      "sound.mp3",
      "visual.png"
    ]);
    const displayNameQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "用户项目" }, directories);
    assert.deepEqual(displayNameQuery.images.map((item) => item.fileName), rootNameQuery.images.map((item) => item.fileName));
    const crossSourceQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "first plain" }, directories);
    assert.deepEqual(crossSourceQuery.images.map((item) => item.fileName), ["plain.txt"]);
    assert.equal((await searchImagesWithAddedDirectories({ ...baseSearch, query: "%" }, directories)).images.length, 0);
    assert.equal((await searchImagesWithAddedDirectories({ ...baseSearch, query: "_" }, directories)).images.length, 0);

    const keywordQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "landscape" }, directories);
    assert.deepEqual(keywordQuery.images.map((item) => item.fileName), ["visual.png"]);
    assert.equal(keywordQuery.images[0].resultKind, "visual");

    const documentFilter = await searchImagesWithAddedDirectories({ ...baseSearch, fileFormat: "docx" }, directories);
    assert.deepEqual(documentFilter.images.map((item) => item.fileName), ["brief.docx"]);

    const directoryFilter = await searchImagesWithAddedDirectories({
      ...baseSearch,
      directoryId: secondDirectory.id
    }, directories);
    assert.deepEqual(directoryFilter.images.map((item) => item.fileName), ["other.md"]);

    const recognizedResults = await searchImagesWithAddedDirectories({
      ...baseSearch,
      recognitionStatus: "recognized"
    }, directories);
    assert.deepEqual(recognizedResults.images.map((item) => item.fileName), ["visual.png"]);
    assert.deepEqual(recognizedResults.availableFormats, ["png"]);

    const unrecognizedResults = await searchImagesWithAddedDirectories({
      ...baseSearch,
      recognitionStatus: "unrecognized"
    }, directories);
    assert.equal(unrecognizedResults.images.length, 0);
    assert.equal(unrecognizedResults.unrecognizedCount, 0);

    await fs.writeFile(path.join(firstDirectoryPath, "new-archive.zip"), "zip");
    searchScanSnapshotService.invalidate([firstDirectory.id]);
    const liveOverlayResults = await searchImagesWithAddedDirectories({
      ...baseSearch,
      query: "new-archive"
    }, directories);
    assert.deepEqual(liveOverlayResults.images.map((item) => item.fileName), ["new-archive.zip"]);
    assert.equal(liveOverlayResults.images[0].iconName, "format-zip");

    searchScanSnapshotService.setActive(false);
    const inactiveSnapshotResults = await searchImagesWithAddedDirectories(baseSearch, directories);
    assert.deepEqual(inactiveSnapshotResults.images.map((item) => item.fileName), [
      "brief.docx",
      "notes.txt",
      "other.md",
      "plain.txt",
      "sound.mp3",
      "visual.png"
    ]);
    searchScanSnapshotService.setActive(true);

    console.log(JSON.stringify({
      visualAndNonVisualMerged: true,
      pathDeduplicationPreserved: true,
      filenameAndExtensionSearchEnabled: true,
      deterministicPathSemanticsEnabled: true,
      crossSourceAndPreserved: true,
      likeWildcardsEscaped: true,
      visualKeywordSearchPreserved: true,
      directoryFormatAndSortFiltersPreserved: true,
      recognitionFiltersRemainVisualOnly: true,
      liveScanOverlayIncludesNewFiles: true,
      inactiveSnapshotFallsBackToIndex: true
    }));
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
}).then(() => app.exit(0)).catch((error) => {
  console.error(error);
  app.exit(1);
});
