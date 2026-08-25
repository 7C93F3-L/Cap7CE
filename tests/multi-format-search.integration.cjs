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
  sortDirection: "asc"
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
      listPendingImageDimensionCandidates,
      listPendingImageRecognitions,
      mergeImageAiQueryEvidence,
      searchIndexedCatalog,
      updateImageRecognition,
      updateManualKeywordsBatch,
      upsertFileManualKeywords,
      writeEmbeddedMetadataBatch,
      listPendingAnimationFactCandidates,
      writeAnimationFactBatch,
      writeImageDimensionBatch,
      writeVisualPropertyBatch,
      writeScannedImagesToIndex
    } = require("../dist-electron/sqliteImageIndex.js");
    const { aiQueryPromptVersion } = require("../dist-electron/aiQueryEvidenceStore.js");
    const { searchImagesWithAddedDirectories } = require("../dist-electron/imageSearchService.js");
    const { planSearchQuery } = require("../dist-electron/searchQueryPlanner.js");
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
    const queryModelId = "qwen3.5-0.8b-q8_0.gguf";
    await fs.mkdir(path.join(userDataPath, "config"), { recursive: true });
    await fs.writeFile(path.join(userDataPath, "config", "gguf-model.json"), JSON.stringify({
      selectedModelId: queryModelId,
      updatedAt: timestamp
    }));
    await mergeImageAiQueryEvidence([{
      imageId: pendingVisual.id,
      keywords: ["黑色上衣"],
      sourceRevision: `v1:${visualFile.file_size}:${Date.parse(visualFile.modified_at)}`,
      modelId: queryModelId,
      promptVersion: aiQueryPromptVersion,
      updatedAt: timestamp
    }]);
    const dimensionCandidate = (await listPendingImageDimensionCandidates([firstDirectory.id]))[0];
    assert.equal(dimensionCandidate.filePath, visualFile.file_path);
    assert.equal(await writeImageDimensionBatch([{
      filePath: visualFile.file_path,
      result: {
        sourceRevision: dimensionCandidate.sourceRevision,
        extractorVersion: 1,
        status: "indexed",
        width: 1600,
        height: 900,
        errorCode: ""
      }
    }]), 1);
    await upsertFileManualKeywords(notesFile, ["meeting", "reference", "landscape"], timestamp);
    const embeddedSearchText = `${"不相关前文 ".repeat(30)}米黄色上衣 长发女性 哥特式建筑 台阶 ${"不相关后文 ".repeat(30)}`;
    await writeEmbeddedMetadataBatch([{
      filePath: visualFile.file_path,
      extraction: {
        sourceRevision: "test-source-revision",
        extractorVersion: 1,
        status: "indexed",
        evidence: [
          {
            kind: "visual_content",
            searchText: embeddedSearchText
          },
          { kind: "embedded_title", searchText: "literal %_\\ metadata" }
        ],
        capturedAt: null,
        errorCode: ""
      }
    }], timestamp);
    const emptyColors = { red: 0, orange: 0, yellow: 0, green: 0, cyan: 0, blue: 0, purple: 0, pink: 0 };
    const visualPropertyRecord = {
      sourceRevision: `v1:${visualFile.file_size}:${Date.parse(visualFile.modified_at)}`,
      analyzerVersion: 1,
      status: "indexed",
      errorCode: "",
      properties: {
        transparentRatio: 4000, semitransparentRatio: 0, borderTransparentRatio: 6000,
        brightnessMean: 4000, brightnessMedian: 4000, darkRatio: 2000, highlightRatio: 0,
        saturationMean: 900, highSaturationRatio: 0, lowSaturationRatio: 9000,
        borderWhiteRatio: 0, borderBlackRatio: 0, borderUniformity: 5000,
        colorRatios: { ...emptyColors, red: 2000 },
        colorBlockRatios: { ...emptyColors, red: 600 }
      }
    };
    await writeVisualPropertyBatch([{
      filePath: visualFile.file_path,
      record: visualPropertyRecord
    }], timestamp);
    const animationCandidate = (await listPendingAnimationFactCandidates([firstDirectory.id]))[0];
    assert.equal(animationCandidate.filePath, visualFile.file_path);
    assert.equal(await writeAnimationFactBatch([{
      filePath: visualFile.file_path,
      result: {
        sourceRevision: animationCandidate.sourceRevision,
        extractorVersion: 1,
        status: "indexed",
        isAnimated: true,
        errorCode: ""
      }
    }]), 1);

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
    assert.ok(allResults.images.every((item) => item.searchEvidence === null));

    const queryCacheResult = await searchImagesWithAddedDirectories({ ...baseSearch, query: "黑色上衣" }, directories);
    assert.deepEqual(queryCacheResult.images, [], "disabled Beta query labels must not affect ordinary search");

    const embeddedQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "米黄色 哥特式" }, directories);
    assert.deepEqual(embeddedQuery.images.map((item) => item.fileName), ["visual.png"]);
    assert.equal(embeddedQuery.images[0].searchEvidence.classification, "embeddedMetadata");
    assert.deepEqual(
      embeddedQuery.images[0].searchEvidence.terms.map((term) => term.bestSource),
      ["embeddedMetadata", "embeddedMetadata"]
    );
    assert.equal(embeddedQuery.images[0].searchEvidence.embeddedMatches.length, 2);
    assert.ok(embeddedQuery.images[0].searchEvidence.embeddedMatches.every((match) => match.snippet.length <= 180));
    assert.equal("embeddedEvidence" in embeddedQuery.images[0], false);
    assert.equal(JSON.stringify(embeddedQuery).includes(embeddedSearchText), false);
    assert.deepEqual(
      (await searchImagesWithAddedDirectories({ ...baseSearch, query: "%_\\" }, directories)).images.map((item) => item.fileName),
      ["visual.png"]
    );
    assert.equal((await searchImagesWithAddedDirectories({ ...baseSearch, query: "negative sampler seed" }, directories)).images.length, 0);

    const transparentQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "无背景" }, directories);
    assert.deepEqual(transparentQuery.images.map((item) => item.fileName), ["visual.png"]);
    assert.equal(transparentQuery.images[0].searchEvidence.weakestSource, "visualPropertyStrong");
    assert.equal(transparentQuery.images[0].searchEvidence.classification, "naturalCondition");
    assert.equal("visualProperties" in transparentQuery.images[0], false);
    const redQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "红色" }, directories);
    assert.deepEqual(redQuery.images.map((item) => item.fileName), ["visual.png"]);
    assert.equal(redQuery.images[0].searchEvidence.weakestSource, "visualPropertySoft");
    assert.equal(redQuery.images[0].searchEvidence.classification, "visualSimilarity");
    const grayQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "灰色调" }, directories);
    assert.deepEqual(grayQuery.images.map((item) => item.fileName), ["visual.png"]);
    assert.equal(grayQuery.images[0].searchEvidence.weakestSource, "visualPropertySoft");
    assert.equal(grayQuery.images[0].searchEvidence.classification, "visualSimilarity");
    assert.equal((await searchImagesWithAddedDirectories({ ...baseSearch, query: "灰" }, directories)).images.length, 0);
    const mixedVisualQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "无背景 红色" }, directories);
    assert.deepEqual(mixedVisualQuery.images.map((item) => item.fileName), ["visual.png"]);
    assert.equal(mixedVisualQuery.images[0].searchEvidence.classification, "visualSimilarity");
    const landscapeQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "横图" }, directories);
    assert.deepEqual(landscapeQuery.images.map((item) => item.fileName), ["visual.png"]);
    assert.equal(landscapeQuery.images[0].searchEvidence.classification, "naturalCondition");
    const aspectRatioQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "16:9" }, directories);
    assert.deepEqual(aspectRatioQuery.images.map((item) => item.fileName), ["visual.png"]);
    assert.equal(aspectRatioQuery.images[0].searchEvidence.classification, "naturalCondition");
    assert.equal((await searchImagesWithAddedDirectories({ ...baseSearch, query: "竖图" }, directories)).images.length, 0);
    const animationQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "动图" }, directories);
    assert.deepEqual(animationQuery.images.map((item) => item.fileName), ["visual.png"]);
    assert.equal(animationQuery.images[0].searchEvidence.weakestSource, "fileCategory");
    await writeVisualPropertyBatch([{
      filePath: visualFile.file_path,
      record: { ...visualPropertyRecord, sourceRevision: "stale-source-revision" }
    }], timestamp);
    assert.equal(
      (await searchImagesWithAddedDirectories({ ...baseSearch, query: "红色" }, directories)).images.length,
      0,
      "stale visual properties must not create search results"
    );
    await writeVisualPropertyBatch([{ filePath: visualFile.file_path, record: visualPropertyRecord }], timestamp);

    const extensionEvidenceResults = await searchImagesWithAddedDirectories({ ...baseSearch, query: "txt" }, directories);
    assert.deepEqual(extensionEvidenceResults.images.map((item) => item.fileName), ["notes.txt", "plain.txt"]);
    assert.ok(extensionEvidenceResults.images.every((item) => item.searchEvidence.classification === "fileFormat"));

    const imageCategoryResults = await searchImagesWithAddedDirectories({ ...baseSearch, query: "图片" }, directories);
    assert.deepEqual(imageCategoryResults.images.map((item) => item.fileName), ["visual.png"]);
    assert.equal(imageCategoryResults.images[0].searchEvidence.weakestSource, "fileCategory");
    const documentCategoryResults = await searchImagesWithAddedDirectories({ ...baseSearch, query: "文档" }, directories);
    assert.deepEqual(documentCategoryResults.images.map((item) => item.fileName), ["brief.docx", "notes.txt", "other.md", "plain.txt"]);
    const textCategoryResults = await searchImagesWithAddedDirectories({ ...baseSearch, query: "文本" }, directories);
    assert.deepEqual(textCategoryResults.images.map((item) => item.fileName), ["notes.txt", "other.md", "plain.txt"]);
    const wordCategoryResults = await searchImagesWithAddedDirectories({ ...baseSearch, query: "word" }, directories);
    assert.deepEqual(wordCategoryResults.images.map((item) => item.fileName), ["brief.docx"]);
    assert.equal((await searchImagesWithAddedDirectories({ ...baseSearch, query: "照片" }, directories)).images.length, 0);
    const audioCategoryResults = await searchImagesWithAddedDirectories({ ...baseSearch, query: "音频" }, directories);
    assert.deepEqual(audioCategoryResults.images.map((item) => item.fileName), ["sound.mp3"]);
    const modelCategoryResults = await searchImagesWithAddedDirectories({ ...baseSearch, query: "模型" }, directories);
    assert.deepEqual(modelCategoryResults.images.map((item) => item.fileName), ["weights.gguf"]);
    const naturalMultiTermResults = await searchImagesWithAddedDirectories({ ...baseSearch, query: "图片 visual" }, directories);
    assert.deepEqual(naturalMultiTermResults.images.map((item) => item.fileName), ["visual.png"]);
    assert.equal((await searchImagesWithAddedDirectories({ ...baseSearch, query: "图片 notes" }, directories)).images.length, 0);
    const fixedJulyPlan = planSearchQuery("本月", new Date(2026, 6, 15, 12));
    const fixedJulyResults = await searchIndexedCatalog({ ...baseSearch, query: "本月" }, directories, fixedJulyPlan);
    assert.deepEqual(fixedJulyResults.images.map((item) => item.fileName), [
      "brief.docx", "notes.txt", "other.md", "plain.txt", "sound.mp3", "visual.png", "weights.gguf"
    ]);
    const fixedAugustPlan = planSearchQuery("本月", new Date(2026, 7, 15, 12));
    assert.equal((await searchIndexedCatalog({ ...baseSearch, query: "本月" }, directories, fixedAugustPlan)).images.length, 0);
    const explicitJulyPlan = planSearchQuery("2026年7月", new Date(2026, 7, 15, 12));
    assert.deepEqual(
      (await searchIndexedCatalog({ ...baseSearch, query: "2026年7月" }, directories, explicitJulyPlan)).images.map((item) => item.fileName),
      ["brief.docx", "notes.txt", "other.md", "plain.txt", "sound.mp3", "visual.png", "weights.gguf"]
    );
    const explicitJulyFirstPlan = planSearchQuery("2026/7/1", new Date(2026, 7, 15, 12));
    assert.deepEqual(
      (await searchIndexedCatalog({ ...baseSearch, query: "2026/7/1" }, directories, explicitJulyFirstPlan)).images.map((item) => item.fileName),
      ["brief.docx"]
    );

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
    assert.equal(notesResult.images[0].searchEvidence.classification, "fileName");
    assert.deepEqual(notesResult.images[0].searchEvidence.terms[0].sources, ["fileName"]);

    const pathOnlyQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "path-only-token" }, directories);
    assert.deepEqual(pathOnlyQuery.images.map((item) => item.fileName), ["plain.txt"]);
    assert.equal(pathOnlyQuery.images[0].searchEvidence.weakestSource, "relativeDirectory");

    const rootNameQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "first" }, directories);
    assert.deepEqual(rootNameQuery.images.map((item) => item.fileName), [
      "brief.docx",
      "notes.txt",
      "plain.txt",
      "sound.mp3",
      "visual.png",
      "weights.gguf"
    ]);
    assert.ok(rootNameQuery.images.every((item) => item.searchEvidence.terms[0].sources.includes("rootDirectoryName")));
    const displayNameQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "用户项目" }, directories);
    assert.deepEqual(displayNameQuery.images.map((item) => item.fileName), rootNameQuery.images.map((item) => item.fileName));
    assert.ok(displayNameQuery.images.every((item) => item.searchEvidence.weakestSource === "directoryDisplayName"));
    const crossSourceQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "first plain" }, directories);
    assert.deepEqual(crossSourceQuery.images.map((item) => item.fileName), ["plain.txt"]);
    assert.deepEqual(crossSourceQuery.images[0].searchEvidence.terms.map((term) => term.bestSource), ["rootDirectoryName", "fileName"]);
    assert.equal(crossSourceQuery.images[0].searchEvidence.classification, "directoryPath");
    assert.deepEqual(
      (await searchImagesWithAddedDirectories({ ...baseSearch, query: "%" }, directories)).images.map((item) => item.fileName),
      ["visual.png"]
    );
    assert.deepEqual(
      (await searchImagesWithAddedDirectories({ ...baseSearch, query: "_" }, directories)).images.map((item) => item.fileName),
      ["visual.png"]
    );

    const keywordQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "landscape" }, directories);
    assert.deepEqual(keywordQuery.images.map((item) => item.fileName), ["notes.txt", "visual.png"]);
    assert.equal(keywordQuery.images[0].searchEvidence.terms[0].bestSource, "userKeyword");
    assert.equal(keywordQuery.images[1].searchEvidence.terms[0].bestSource, "aiKeyword");
    const visualKeywordResult = keywordQuery.images[1];
    assert.equal(visualKeywordResult.resultKind, "visual");
    assert.match(visualKeywordResult.thumbnailUrl, /&sourceRevision=v1%3A3%3A/u);
    const initialVisualThumbnailUrl = visualKeywordResult.thumbnailUrl;
    await fs.writeFile(path.join(firstDirectoryPath, "visual.png"), "new");
    const changedVisualTime = new Date("2026-08-01T00:00:00.000Z");
    await fs.utimes(path.join(firstDirectoryPath, "visual.png"), changedVisualTime, changedVisualTime);
    searchScanSnapshotService.invalidate([firstDirectory.id]);
    const refreshedVisualQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "landscape" }, directories);
    assert.notEqual(refreshedVisualQuery.images.find((item) => item.fileName === "visual.png").thumbnailUrl, initialVisualThumbnailUrl);

    const nonVisualKeywordQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "meeting" }, directories);
    assert.deepEqual(nonVisualKeywordQuery.images.map((item) => item.fileName), ["notes.txt"]);
    assert.deepEqual(nonVisualKeywordQuery.images[0].keywords, ["meeting", "reference", "landscape"]);
    assert.equal(nonVisualKeywordQuery.images[0].resultKind, "file");
    await upsertFileManualKeywords(modelFile, ["local-model"], timestamp);
    const modelKeywordQuery = await searchImagesWithAddedDirectories({ ...baseSearch, query: "local-model" }, directories);
    assert.deepEqual(modelKeywordQuery.images.map((item) => item.fileName), ["weights.gguf"]);
    assert.equal(modelKeywordQuery.images[0].iconName, "format-model");
    assert.equal(modelKeywordQuery.images[0].previewKind, "fileInfo");
    assert.deepEqual(await getImageIndexQualityStats(), {
      totalFiles: 7,
      recognizedFiles: 3,
      unrecognizedFiles: 4,
      totalVisualImages: 1,
      pendingVisualImages: 0
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

    await fs.writeFile(path.join(firstDirectoryPath, "new-archive.zip"), "zip");
    searchScanSnapshotService.invalidate([firstDirectory.id]);
    const liveOverlayResults = await searchImagesWithAddedDirectories({
      ...baseSearch,
      query: "new-archive"
    }, directories);
    assert.deepEqual(liveOverlayResults.images.map((item) => item.fileName), ["new-archive.zip"]);
    assert.equal(liveOverlayResults.images[0].iconName, "format-zip");

    const explicitRefreshScan = await scanImageDirectories(directories);
    await writeScannedImagesToIndex(
      directories.map((directory) => directory.id),
      explicitRefreshScan.images,
      explicitRefreshScan.scannedAt,
      explicitRefreshScan.files
    );
    searchScanSnapshotService.setActive(false);
    const inactiveSnapshotResults = await searchImagesWithAddedDirectories(baseSearch, directories);
    assert.deepEqual(inactiveSnapshotResults.images.map((item) => item.fileName), [
      "brief.docx",
      "new-archive.zip",
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
        assert.ok(result.images.every((item) => item.searchEvidence !== null), `${testCase.id}: evidence missing`);
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
      embeddedMetadataAndRestrictedSnippetsEnabled: true,
      likeWildcardsEscaped: true,
      visualKeywordSearchPreserved: true,
      indexedOrientationAndAspectRatioSearchEnabled: true,
      nonVisualKeywordSearchEnabled: true,
      promotedFormatKeywordSearchEnabled: true,
      sharedViewRangeFilteringEnabled: true,
      mixedKeywordBatchPreserved: true,
      nonVisualKeywordsPreservedAcrossRescan: true,
      nonVisualKeywordsCanBeCleared: true,
      allSupportedFilesIncludedInCatalogStats: true,
      directoryFormatAndSortFiltersPreserved: true,
      unifiedKeywordSearchAcrossSupportedFormats: true,
      liveScanOverlayIncludesNewFiles: true,
      changedFileThumbnailRevisionUpdated: true,
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
