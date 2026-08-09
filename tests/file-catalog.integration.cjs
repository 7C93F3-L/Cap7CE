const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");
const initSqlJs = require("sql.js");

const testRoot = path.join(os.tmpdir(), `cap7ce-file-catalog-${process.pid}-${Date.now()}`);
const userDataPath = path.join(testRoot, "user-data");
const sourceDirectory = path.join(testRoot, "sources");
const databasePath = path.join(userDataPath, "index", `${["image", "everything"].join("-")}.db`);
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
    await fs.writeFile(databasePath, legacyDatabase.export());
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
      reassignDirectoryImages,
      searchIndexedImages,
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
    await fs.access(`${databasePath}.pre-path-v1.bak`);
    const migratedFileDatabase = new SQL.Database(await fs.readFile(databasePath));
    const migratedFileColumns = migratedFileDatabase.exec("PRAGMA table_info(files)")[0]?.values ?? [];
    migratedFileDatabase.close();
    assert.ok(migratedFileColumns.some((column) => String(column[1]) === "user_keywords"));
    assert.ok(migratedFileColumns.some((column) => String(column[1]) === "user_keywords_at"));
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

    await writeScannedImagesToIndex([directoryId], scan.images, scan.scannedAt, scan.files);
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
      totalImages: 1,
      recognizedImages: 0,
      unrecognizedImages: 1
    });
    assert.equal(await getPendingImageRecognitionCount(directoryId), 1);
    const existingSearch = await searchIndexedImages({
      query: "",
      directoryId,
      fileFormat: "all",
      sortField: "file_name",
      sortDirection: "asc",
      recognitionStatus: "all"
    });
    assert.deepEqual(existingSearch.images.map((image) => image.fileName), ["visual.png"]);

    await fs.rm(textPath);
    const rescan = await scanImageDirectories([directory]);
    await writeScannedImagesToIndex([directoryId], rescan.images, rescan.scannedAt, rescan.files);
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
    assert.equal((await getImageIndexQualityStats(directoryId)).totalImages, 1);

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
    assert.equal((await getImageIndexQualityStats(replacementDirectoryId)).totalImages, 1);
    assert.equal((await getCompletedFileScanDirectoryIds([directoryId, replacementDirectoryId])).size, 0);

    const deletedImagePaths = await deleteDirectoryImages(replacementDirectoryId);
    assert.deepEqual(deletedImagePaths, [imagePath]);
    assert.equal((await getExistingFileCountsByDirectory([replacementDirectoryId]))[replacementDirectoryId], 0);
    assert.equal((await getImageIndexQualityStats(replacementDirectoryId)).totalImages, 0);

    await writeScannedImagesToIndex([emptyDirectoryId], [], timestamp, []);
    assert.equal((await getExistingFileCountsByDirectory([emptyDirectoryId]))[emptyDirectoryId], 0);
    assert.equal((await getCompletedFileScanDirectoryIds([emptyDirectoryId])).has(emptyDirectoryId), true);

    console.log(JSON.stringify({
      legacyImagesBackfilled: true,
      userKeywordColumnsMigrated: true,
      legacyPathEvidenceBackfilledWithoutSourceScan: true,
      migrationBackupCreated: true,
      relativeDirectoryStoredAndReassigned: true,
      mixedFormatsCataloged: 3,
      missingFilesMarkedBeforeCleanup: true,
      nonVisualAiBoundaryPreserved: true,
      visualSearchBoundaryPreserved: true,
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
