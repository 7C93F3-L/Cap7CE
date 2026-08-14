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
const k2DirectoryPath = path.join(testRoot, "K2真实根目录");
const k2NestedDirectoryPath = path.join(k2DirectoryPath, "海报", "活动素材");
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
    await fs.writeFile(path.join(firstDirectoryPath, "weights.gguf"), "gguf");
    await fs.writeFile(path.join(firstDirectoryPath, "ignored.exe"), "exe");
    await fs.writeFile(path.join(nestedPathOnlyDirectory, "plain.txt"), "plain");
    await fs.writeFile(path.join(secondDirectoryPath, "other.md"), "md");
    const orderedFiles = [
      path.join(firstDirectoryPath, "brief.docx"),
      path.join(firstDirectoryPath, "sound.mp3"),
      path.join(nestedPathOnlyDirectory, "plain.txt"),
      path.join(firstDirectoryPath, "notes.txt"),
      path.join(secondDirectoryPath, "other.md"),
      path.join(firstDirectoryPath, "visual.png"),
      path.join(firstDirectoryPath, "weights.gguf")
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
      getImageIndexQualityStats,
      listPendingImageRecognitions,
      updateImageRecognition,
      updateManualKeywordsBatch,
      upsertFileManualKeywords,
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
    await updateImageRecognition(pendingVisual.id, "", ["landscape"], timestamp);
    const notesFile = initialScan.files.find((file) => file.file_name === "notes.txt");
    const visualFile = initialScan.images.find((file) => file.file_name === "visual.png");
    const modelFile = initialScan.files.find((file) => file.file_name === "weights.gguf");
    assert.ok(notesFile);
    assert.ok(visualFile);
    assert.ok(modelFile);
    await upsertFileManualKeywords(notesFile, ["meeting", "reference"], timestamp);

    const allResults = await searchImagesWithAddedDirectories(baseSearch, directories);
    assert.deepEqual(allResults.images.map((item) => item.fileName), [
      "brief.docx",
      "notes.txt",
      "other.md",
      "plain.txt",
      "sound.mp3",
      "visual.png",
      "weights.gguf"
    ]);
    assert.equal(new Set(allResults.images.map((item) => item.filePath.toLowerCase())).size, allResults.images.length);
    assert.deepEqual(allResults.availableFormats, ["docx", "gguf", "md", "mp3", "png", "txt"]);
    assert.equal(allResults.unrecognizedCount, 0);

    const nameDescending = await searchImagesWithAddedDirectories({
      ...baseSearch,
      sortDirection: "desc"
    }, directories);
    assert.deepEqual(nameDescending.images.map((item) => item.fileName), [
      "weights.gguf",
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
      "weights.gguf",
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
      "visual.png",
      "weights.gguf"
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

    const nonVisualKeywordQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "meeting" }, directories);
    assert.deepEqual(nonVisualKeywordQuery.images.map((item) => item.fileName), ["notes.txt"]);
    assert.deepEqual(nonVisualKeywordQuery.images[0].keywords, ["meeting", "reference"]);
    assert.equal(nonVisualKeywordQuery.images[0].resultKind, "file");
    await upsertFileManualKeywords(modelFile, ["local-model"], timestamp);
    const modelKeywordQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "local-model" }, directories);
    assert.deepEqual(modelKeywordQuery.images.map((item) => item.fileName), ["weights.gguf"]);
    assert.equal(modelKeywordQuery.images[0].iconName, "format-model");
    assert.equal(modelKeywordQuery.images[0].previewKind, "fileInfo");
    assert.deepEqual(await getImageIndexQualityStats(), {
      totalImages: 1,
      recognizedImages: 1,
      unrecognizedImages: 0
    });

    await updateManualKeywordsBatch([
      { file: notesFile, resultKind: "file" },
      { file: visualFile, resultKind: "visual" }
    ], [], "shared-project");
    const mixedKeywordQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "shared-project" }, directories);
    assert.deepEqual(mixedKeywordQuery.images.map((item) => item.fileName), ["notes.txt", "visual.png"]);
    const rescan = await scanImageDirectories(directories);
    await writeScannedImagesToIndex(
      directories.map((directory) => directory.id),
      rescan.images,
      rescan.scannedAt,
      rescan.files
    );
    const rescannedKeywordQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "shared-project" }, directories);
    assert.deepEqual(rescannedKeywordQuery.images.map((item) => item.fileName), ["notes.txt", "visual.png"]);
    const rescannedModelKeywordQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "local-model" }, directories);
    assert.deepEqual(rescannedModelKeywordQuery.images.map((item) => item.fileName), ["weights.gguf"]);
    await upsertFileManualKeywords(notesFile, [], timestamp);
    const clearedKeywordQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "shared-project" }, directories);
    assert.deepEqual(clearedKeywordQuery.images.map((item) => item.fileName), ["visual.png"]);

    const documentFilter = await searchImagesWithAddedDirectories({ ...baseSearch, fileFormat: "docx" }, directories);
    assert.deepEqual(documentFilter.images.map((item) => item.fileName), ["brief.docx"]);

    const compactRange = await searchImagesWithAddedDirectories({
      ...baseSearch,
      includedExtensions: [".png", ".txt"]
    }, directories);
    assert.deepEqual(compactRange.images.map((item) => item.fileName), ["notes.txt", "plain.txt", "visual.png"]);
    assert.deepEqual(compactRange.availableFormats, ["png", "txt"]);

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
      "visual.png",
      "weights.gguf"
    ]);
    searchScanSnapshotService.setActive(true);

    await fs.mkdir(k2NestedDirectoryPath, { recursive: true });
    await fs.writeFile(path.join(k2NestedDirectoryPath, "春季主视觉.png"), "png");
    await fs.writeFile(path.join(k2NestedDirectoryPath, "说明.txt"), "txt");
    await fs.writeFile(path.join(k2NestedDirectoryPath, "无关项目.txt"), "txt");
    const k2Directory = createDirectory("k2-directory", "客户展示名", k2DirectoryPath);
    directories.push(k2Directory);
    const k2Scan = await scanImageDirectories([k2Directory]);
    await writeScannedImagesToIndex(
      [k2Directory.id],
      k2Scan.images,
      k2Scan.scannedAt,
      k2Scan.files
    );
    const k2NotesFile = k2Scan.files.find((file) => file.file_name === "说明.txt");
    assert.ok(k2NotesFile);
    await upsertFileManualKeywords(k2NotesFile, ["现场确认"], timestamp);

    const k2Cases = [
      { id: "file-name", query: "春季主视觉", expected: ["春季主视觉.png"] },
      { id: "root-real-name", query: "K2真实根目录", expected: ["春季主视觉.png", "说明.txt", "无关项目.txt"] },
      { id: "display-name", query: "客户展示名", expected: ["春季主视觉.png", "说明.txt", "无关项目.txt"] },
      { id: "relative-parent", query: "海报 活动素材", expected: ["春季主视觉.png", "说明.txt", "无关项目.txt"] },
      { id: "cross-field-and", query: "海报 说明 txt 现场确认", expected: ["说明.txt"] },
      { id: "no-sibling-propagation", query: "无关项目", expected: ["无关项目.txt"] },
      { id: "outside-path-miss", query: "路径外词", expected: [] }
    ];
    const runK2Cases = async () => {
      const output = {};
      for (const testCase of k2Cases) {
        const result = await searchImagesWithAddedDirectories({
          ...baseSearch,
          query: testCase.query,
          directoryId: k2Directory.id
        }, directories);
        const fileNames = result.images.map((item) => item.fileName);
        assert.deepEqual(fileNames, testCase.expected, testCase.id);
        output[testCase.id] = fileNames;
      }
      return output;
    };

    searchScanSnapshotService.setActive(false);
    const k2PersistedResults = await runK2Cases();
    searchScanSnapshotService.setActive(true);
    searchScanSnapshotService.invalidate([k2Directory.id]);
    const k2FreshScanResults = await runK2Cases();
    const k2ReusedSnapshotResults = await runK2Cases();
    assert.deepEqual(k2FreshScanResults, k2PersistedResults);
    assert.deepEqual(k2ReusedSnapshotResults, k2PersistedResults);

    console.log(JSON.stringify({
      visualAndNonVisualMerged: true,
      pathDeduplicationPreserved: true,
      filenameAndExtensionSearchEnabled: true,
      deterministicPathSemanticsEnabled: true,
      crossSourceAndPreserved: true,
      likeWildcardsEscaped: true,
      visualKeywordSearchPreserved: true,
      nonVisualKeywordSearchEnabled: true,
      promotedFormatKeywordSearchEnabled: true,
      sharedViewRangeFilteringEnabled: true,
      mixedKeywordBatchPreserved: true,
      nonVisualKeywordsPreservedAcrossRescan: true,
      nonVisualKeywordsCanBeCleared: true,
      nonVisualKeywordsExcludedFromImageStats: true,
      directoryFormatAndSortFiltersPreserved: true,
      recognitionFiltersRemainVisualOnly: true,
      liveScanOverlayIncludesNewFiles: true,
      inactiveSnapshotFallsBackToIndex: true,
      k2DeterministicSampleCases: k2Cases.length,
      k2PersistedFreshAndReusedResultsMatch: true,
      k2SiblingNamesDoNotPropagate: true
    }));
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
}).then(() => app.exit(0)).catch((error) => {
  console.error(error);
  app.exit(1);
});
