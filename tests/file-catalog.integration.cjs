const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");
const initSqlJs = require("sql.js");

const testRoot = path.join(os.tmpdir(), `cap7ce-file-catalog-${process.pid}-${Date.now()}`);
const userDataPath = path.join(testRoot, "user-data");
const sourceDirectory = path.join(testRoot, "sources");
const databasePath = path.join(userDataPath, "index", "cap7ce-index.db");
const legacyDatabasePath = path.join(userDataPath, "index", "image-everything.db");
const directoryId = "catalog-directory";
const replacementDirectoryId = "catalog-parent-directory";
const emptyDirectoryId = "catalog-empty-directory";
const timestamp = new Date("2026-07-31T00:00:00.000Z").toISOString();

app.setPath("userData", userDataPath);

app.whenReady().then(async () => {
  const SQL = await initSqlJs({
    locateFile: (fileName) => require.resolve(`sql.js/dist/${fileName}`)
  });

  try {
    await fs.mkdir(path.dirname(databasePath), { recursive: true });
    await fs.mkdir(sourceDirectory, { recursive: true });
    const imagePath = path.join(sourceDirectory, "visual.png");
    const textPath = path.join(sourceDirectory, "notes.txt");
    const documentPath = path.join(sourceDirectory, "nested", "brief.docx");
    await fs.mkdir(path.dirname(documentPath), { recursive: true });
    await fs.writeFile(imagePath, "png");
    await fs.writeFile(textPath, "txt");
    await fs.writeFile(documentPath, "docx");
    await fs.writeFile(path.join(sourceDirectory, "ignored.exe"), "exe");

    const legacyDatabase = new SQL.Database();
    legacyDatabase.exec(`
      CREATE TABLE images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL UNIQUE,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        modified_at TEXT NOT NULL,
        image_width INTEGER,
        image_height INTEGER,
        caption TEXT NOT NULL DEFAULT '',
        keywords TEXT NOT NULL DEFAULT '',
        indexed_at TEXT NOT NULL,
        directory_id TEXT NOT NULL,
        ai_error TEXT NOT NULL DEFAULT '',
        ai_failed_at TEXT,
        manual_index INTEGER NOT NULL DEFAULT 0 CHECK (manual_index IN (0, 1)),
        "exists" INTEGER NOT NULL DEFAULT 1 CHECK ("exists" IN (0, 1))
      );
    `);
    legacyDatabase.run(`
      INSERT INTO images (
        file_path, file_name, file_size, created_at, modified_at,
        caption, keywords, indexed_at, directory_id, "exists"
      ) VALUES (
        :file_path, :file_name, 3, :created_at, :modified_at,
        '', '', :indexed_at, :directory_id, 1
      )
    `, {
      ":file_path": imagePath,
      ":file_name": path.basename(imagePath),
      ":created_at": timestamp,
      ":modified_at": timestamp,
      ":indexed_at": timestamp,
      ":directory_id": directoryId
    });
    await fs.writeFile(legacyDatabasePath, legacyDatabase.export());
    legacyDatabase.close();

    const { scanImageDirectories } = require("../dist-electron/imageScanner.js");
    const {
      deleteDirectoryImages,
      backfillFilePathEvidence,
      ensureImageDatabase,
      getCompletedFileScanDirectoryIds,
      getExistingFileCountsByDirectory,
      getImageIndexQualityStats,
      getPendingImageRecognitionCount,
      filterPendingVisualPropertyCandidates,
      listPendingEmbeddedMetadataCandidates,
      listPendingImageDimensionCandidates,
      migrateLegacyDatabaseFileName,
      reassignDirectoryImages,
      searchIndexedImages,
      updateImageRecognition,
      updateManualKeywordsBatch,
      upsertFileManualKeywords,
      writeEmbeddedMetadataBatch,
      writeImageDimensionBatch,
      writeVisualPropertyBatch,
      writeScannedImagesToIndex
    } = require("../dist-electron/sqliteImageIndex.js");
    const { cleanupMissingIndexedFiles } = require("../dist-electron/staleFileCleanupService.js");

    const directory = {
      id: directoryId,
      name: "sources",
      path: sourceDirectory,
      indexedCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await ensureImageDatabase();
    await fs.access(`${legacyDatabasePath}.pre-cap7ce-name-v1.bak`);
    await assert.rejects(fs.access(legacyDatabasePath), (error) => error?.code === "ENOENT");
    await fs.access(`${databasePath}.pre-path-v1.bak`);
    const migratedFileDatabase = new SQL.Database(await fs.readFile(databasePath));
    const migratedFileColumns = migratedFileDatabase.exec("PRAGMA table_info(files)")[0]?.values ?? [];
    const migratedUserMetadataColumns = migratedFileDatabase.exec("PRAGMA table_info(file_user_metadata)")[0]?.values ?? [];
    const migratedAiMetadataColumns = migratedFileDatabase.exec("PRAGMA table_info(image_ai_metadata)")[0]?.values ?? [];
    migratedFileDatabase.close();
    assert.ok(!migratedFileColumns.some((column) => String(column[1]) === "user_keywords"));
    assert.ok(migratedUserMetadataColumns.some((column) => String(column[1]) === "keywords"));
    assert.ok(migratedAiMetadataColumns.some((column) => String(column[1]) === "caption"));
    await fs.access(`${databasePath}.pre-metadata-ownership-v1.bak`);
    assert.equal(await backfillFilePathEvidence([directory]), 1);
    assert.equal((await getExistingFileCountsByDirectory([directoryId]))[directoryId], 1);
    assert.equal((await getCompletedFileScanDirectoryIds([directoryId])).has(directoryId), false);
    await assert.rejects(
      () => scanImageDirectories([directory], { isCancelled: () => true }),
      (error) => error?.code === "ECANCELED"
    );
    const scan = await scanImageDirectories([directory]);
    assert.deepEqual(scan.files.map((file) => file.file_name).sort(), ["brief.docx", "notes.txt", "visual.png"]);
    assert.deepEqual(scan.images.map((file) => file.file_name), ["visual.png"]);
    assert.equal(scan.directories[0].file_count, 3);
    assert.equal(scan.directories[0].image_count, 1);
    assert.equal(scan.summaries[0].fileCount, 3);

    await writeScannedImagesToIndex([directoryId], scan.images, scan.scannedAt, scan.files);
    const pendingEmbedded = await listPendingEmbeddedMetadataCandidates([directoryId]);
    assert.deepEqual(pendingEmbedded.map((candidate) => candidate.filePath), [imagePath]);
    const pendingDimensions = await listPendingImageDimensionCandidates([directoryId]);
    assert.deepEqual(pendingDimensions.map((candidate) => candidate.filePath), [imagePath]);
    assert.equal(await writeImageDimensionBatch([{
      filePath: imagePath,
      result: {
        sourceRevision: pendingDimensions[0].sourceRevision,
        extractorVersion: 1,
        status: "indexed",
        width: 1600,
        height: 900,
        errorCode: ""
      }
    }]), 1);
    assert.deepEqual(await listPendingImageDimensionCandidates([directoryId]), []);
    const visualPropertyCandidate = {
      filePath: imagePath,
      thumbnailPath: path.join(testRoot, "visual.capth"),
      sourceRevision: pendingEmbedded[0].sourceRevision
    };
    assert.deepEqual(await filterPendingVisualPropertyCandidates([visualPropertyCandidate]), [visualPropertyCandidate]);
    assert.equal(await writeVisualPropertyBatch([{
      filePath: imagePath,
      record: {
        sourceRevision: visualPropertyCandidate.sourceRevision,
        analyzerVersion: 1,
        status: "failed",
        properties: null,
        errorCode: "test-failure"
      }
    }], timestamp), 1);
    assert.deepEqual(await filterPendingVisualPropertyCandidates([visualPropertyCandidate]), []);
    assert.deepEqual(await filterPendingVisualPropertyCandidates([{
      ...visualPropertyCandidate,
      sourceRevision: "stale-source-revision"
    }]), [], "thumbnail/source revisions must match the current file catalog before analysis");
    await Promise.all([
      writeEmbeddedMetadataBatch([{
        filePath: imagePath,
        extraction: {
          sourceRevision: pendingEmbedded[0].sourceRevision,
          extractorVersion: 1,
          status: "empty",
          evidence: [],
          capturedAt: null,
          errorCode: ""
        }
      }], timestamp),
      upsertFileManualKeywords(scan.files.find((file) => file.file_path === imagePath), [], timestamp)
    ]);
    assert.deepEqual(await listPendingEmbeddedMetadataCandidates([directoryId]), []);
    const pathEvidenceDatabase = new SQL.Database(await fs.readFile(databasePath));
    const pathEvidenceRow = pathEvidenceDatabase.exec(
      "SELECT relative_directory, path_evidence_version FROM files WHERE file_path = :file_path",
      { ":file_path": documentPath }
    )[0]?.values[0];
    pathEvidenceDatabase.close();
    assert.deepEqual(pathEvidenceRow, ["nested", 1]);
    assert.equal((await getExistingFileCountsByDirectory([directoryId]))[directoryId], 3);
    assert.equal((await getCompletedFileScanDirectoryIds([directoryId])).has(directoryId), true);
    assert.deepEqual(await getImageIndexQualityStats(directoryId), {
      totalFiles: 3,
      recognizedFiles: 0,
      unrecognizedFiles: 3,
      totalVisualImages: 1,
      pendingVisualImages: 1
    });
    assert.equal(await getPendingImageRecognitionCount(directoryId), 1);
    const existingSearch = await searchIndexedImages({
      query: "",
      directoryId,
      fileFormat: "all",
      sortField: "file_name",
      sortDirection: "asc"
    });
    assert.deepEqual(existingSearch.images.map((image) => image.fileName), ["visual.png"]);
    assert.deepEqual(
      { width: existingSearch.images[0].imageWidth, height: existingSearch.images[0].imageHeight },
      { width: 1600, height: 900 }
    );

    const visualFile = scan.images[0];
    const nonVisualFile = scan.files.find((file) => file.file_path === textPath);
    assert.ok(nonVisualFile);
    await updateImageRecognition(1, "保留的 AI 描述", ["共同词", "视觉私有词"], timestamp);
    await upsertFileManualKeywords(nonVisualFile, ["共同词", "文本私有词"], timestamp);
    const normalizedBatchKeywords = await updateManualKeywordsBatch([
      { file: visualFile, resultKind: "visual" },
      { file: nonVisualFile, resultKind: "file" }
    ], ["共同词"], " 新词， 新词, ");
    assert.deepEqual(normalizedBatchKeywords, ["新词"]);

    const keywordDatabase = new SQL.Database(await fs.readFile(databasePath));
    const visualAiKeywordRow = keywordDatabase.exec(
      `SELECT ai.caption, ai.keywords
       FROM images AS image
       INNER JOIN image_ai_metadata AS ai ON ai.image_id = image.id
       WHERE image.file_path = :file_path`,
      { ":file_path": imagePath }
    )[0]?.values[0];
    const visualUserKeywordRow = keywordDatabase.exec(
      "SELECT keywords FROM file_user_metadata WHERE file_path = :file_path",
      { ":file_path": imagePath }
    )[0]?.values[0];
    const nonVisualUserKeywordRow = keywordDatabase.exec(
      "SELECT keywords FROM file_user_metadata WHERE file_path = :file_path",
      { ":file_path": textPath }
    )[0]?.values[0];
    keywordDatabase.close();
    assert.deepEqual(visualAiKeywordRow, ["保留的 AI 描述", "共同词,视觉私有词"]);
    assert.deepEqual(visualUserKeywordRow, ["新词"]);
    assert.deepEqual(nonVisualUserKeywordRow, ["文本私有词,新词"]);
    assert.deepEqual(await getImageIndexQualityStats(directoryId), {
      totalFiles: 3,
      recognizedFiles: 2,
      unrecognizedFiles: 1,
      totalVisualImages: 1,
      pendingVisualImages: 0
    });

    await fs.rm(textPath);
    const rescan = await scanImageDirectories([directory]);
    assert.equal(rescan.summaries[0].fileCount, 2);
    await writeScannedImagesToIndex([directoryId], rescan.images, rescan.scannedAt, rescan.files);
    assert.deepEqual(await listPendingImageDimensionCandidates([directoryId]), [], "unchanged source dimensions should survive a rescan");
    const markedDatabase = new SQL.Database(await fs.readFile(databasePath));
    const missingRow = markedDatabase.exec(
      "SELECT \"exists\" FROM files WHERE file_path = :file_path",
      { ":file_path": textPath }
    )[0]?.values[0];
    markedDatabase.close();
    assert.equal(Number(missingRow?.[0]), 0);
    assert.equal((await getExistingFileCountsByDirectory([directoryId]))[directoryId], 2);
    const cleanup = await cleanupMissingIndexedFiles(directoryId);
    assert.deepEqual(cleanup.removedFilePaths, [textPath]);
    assert.equal((await getExistingFileCountsByDirectory([directoryId]))[directoryId], 2);
    assert.deepEqual(await getImageIndexQualityStats(directoryId), {
      totalFiles: 2,
      recognizedFiles: 1,
      unrecognizedFiles: 1,
      totalVisualImages: 1,
      pendingVisualImages: 0
    });

    await fs.writeFile(imagePath, "changed-png");
    const changedImageTime = new Date("2026-08-01T00:00:00.000Z");
    await fs.utimes(imagePath, changedImageTime, changedImageTime);
    const changedScan = await scanImageDirectories([directory]);
    await writeScannedImagesToIndex([directoryId], changedScan.images, changedScan.scannedAt, changedScan.files);
    const changedDimensionCandidates = await listPendingImageDimensionCandidates([directoryId]);
    assert.deepEqual(changedDimensionCandidates.map((candidate) => candidate.filePath), [imagePath]);
    assert.equal(await writeImageDimensionBatch([{
      filePath: imagePath,
      result: {
        sourceRevision: pendingDimensions[0].sourceRevision,
        extractorVersion: 1,
        status: "indexed",
        width: 1600,
        height: 900,
        errorCode: ""
      }
    }]), 0, "stale dimension records must not overwrite a changed source");
    assert.equal(await writeImageDimensionBatch([{
      filePath: imagePath,
      result: {
        sourceRevision: changedDimensionCandidates[0].sourceRevision,
        extractorVersion: 1,
        status: "indexed",
        width: 900,
        height: 1600,
        errorCode: ""
      }
    }]), 1);

    await reassignDirectoryImages([{
      fromDirectoryIds: [directoryId],
      toDirectoryId: replacementDirectoryId,
      toDirectoryPath: testRoot
    }]);
    const reassignedDatabase = new SQL.Database(await fs.readFile(databasePath));
    const reassignedPathRow = reassignedDatabase.exec(
      "SELECT relative_directory, path_evidence_version FROM files WHERE file_path = :file_path",
      { ":file_path": documentPath }
    )[0]?.values[0];
    reassignedDatabase.close();
    assert.deepEqual(reassignedPathRow, ["sources/nested", 1]);
    assert.equal((await getExistingFileCountsByDirectory([directoryId, replacementDirectoryId]))[replacementDirectoryId], 2);
    assert.deepEqual(await getImageIndexQualityStats(replacementDirectoryId), {
      totalFiles: 2,
      recognizedFiles: 1,
      unrecognizedFiles: 1,
      totalVisualImages: 1,
      pendingVisualImages: 0
    });
    assert.equal((await getCompletedFileScanDirectoryIds([directoryId, replacementDirectoryId])).size, 0);

    const deletedImagePaths = await deleteDirectoryImages(replacementDirectoryId);
    assert.deepEqual(deletedImagePaths, [imagePath]);
    assert.equal((await getExistingFileCountsByDirectory([replacementDirectoryId]))[replacementDirectoryId], 0);
    assert.deepEqual(await getImageIndexQualityStats(replacementDirectoryId), {
      totalFiles: 0,
      recognizedFiles: 0,
      unrecognizedFiles: 0,
      totalVisualImages: 0,
      pendingVisualImages: 0
    });

    await writeScannedImagesToIndex([emptyDirectoryId], [], timestamp, []);
    assert.equal((await getExistingFileCountsByDirectory([emptyDirectoryId]))[emptyDirectoryId], 0);
    assert.equal((await getCompletedFileScanDirectoryIds([emptyDirectoryId])).has(emptyDirectoryId), true);

    const collisionRoot = path.join(testRoot, "database-name-collision");
    const collisionCurrentPath = path.join(collisionRoot, "cap7ce-index.db");
    const collisionLegacyPath = path.join(collisionRoot, "image-everything.db");
    await fs.mkdir(collisionRoot, { recursive: true });
    await fs.writeFile(collisionCurrentPath, "current-database");
    await fs.writeFile(collisionLegacyPath, "legacy-database");
    await migrateLegacyDatabaseFileName(collisionCurrentPath, collisionLegacyPath);
    assert.equal(await fs.readFile(collisionCurrentPath, "utf8"), "current-database");
    assert.equal(await fs.readFile(collisionLegacyPath, "utf8"), "legacy-database");

    const occupiedBackupRoot = path.join(testRoot, "occupied-migration-backup");
    const occupiedBackupCurrentPath = path.join(occupiedBackupRoot, "cap7ce-index.db");
    const occupiedBackupLegacyPath = path.join(occupiedBackupRoot, "image-everything.db");
    const occupiedBackupPath = `${occupiedBackupLegacyPath}.pre-cap7ce-name-v1.bak`;
    await fs.mkdir(occupiedBackupRoot, { recursive: true });
    await fs.writeFile(occupiedBackupLegacyPath, "latest-legacy-database");
    await fs.writeFile(occupiedBackupPath, "earlier-backup");
    await migrateLegacyDatabaseFileName(occupiedBackupCurrentPath, occupiedBackupLegacyPath);
    assert.equal(await fs.readFile(occupiedBackupCurrentPath, "utf8"), "latest-legacy-database");
    assert.equal(await fs.readFile(occupiedBackupPath, "utf8"), "earlier-backup");
    assert.equal(await fs.readFile(`${occupiedBackupPath}.1`, "utf8"), "latest-legacy-database");

    console.log(JSON.stringify({
      legacyImagesBackfilled: true,
      legacyDatabaseFileNameMigrated: true,
      databaseFileNameCollisionPreservedBoth: true,
      occupiedMigrationBackupPreserved: true,
      userAndAiMetadataTablesSeparated: true,
      legacyPathEvidenceBackfilledWithoutSourceScan: true,
      migrationBackupCreated: true,
      relativeDirectoryStoredAndReassigned: true,
      mixedFormatsCataloged: 3,
      allSupportedFileStatsUnified: true,
      recognizedAndUnrecognizedSumToTotal: true,
      mixedKeywordBatchPreservedAiAndPrivateKeywords: true,
      missingFilesMarkedBeforeCleanup: true,
      nonVisualAiBoundaryPreserved: true,
      visualSearchBoundaryPreserved: true,
      sourceDimensionsIndexedAndInvalidated: true,
      missingFilesCleaned: 1,
      directoryReassignmentSynchronized: true,
      directoryDeletionSynchronized: true,
      emptyDirectoryScanRecorded: true,
      cooperativeScanCancellation: true
    }));
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
}).then(() => app.exit(0)).catch((error) => {
  console.error(error);
  app.exit(1);
});
