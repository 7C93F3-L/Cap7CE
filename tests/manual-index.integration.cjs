const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");
const initSqlJs = require("sql.js");

const testRoot = path.join(
  os.tmpdir(),
  `cap7ce-manual-index-${process.pid}-${Date.now()}`
);
const userDataPath = path.join(testRoot, "user-data");
const sourceDirectory = path.join(testRoot, "sources");
const sourcePath = path.join(sourceDirectory, "manual-test.png");
const unindexedSourcePath = path.join(sourceDirectory, "unindexed-manual-test.webp");
const databasePath = path.join(userDataPath, "index", `${["image", "everything"].join("-")}.db`);
const directoryId = "manual-test-directory";
const initialTimestamp = new Date("2026-06-15T00:00:00.000Z").toISOString();

app.setPath("userData", userDataPath);

const loadRawDatabase = async (SQL) => (
  new SQL.Database(await fs.readFile(databasePath))
);

const readIndexedRow = async (SQL, targetPath = sourcePath) => {
  const database = await loadRawDatabase(SQL);
  try {
    const result = database.exec(`
      SELECT id, caption, keywords, manual_index, ai_error
      FROM images
      WHERE file_path = '${targetPath.replaceAll("'", "''")}'
    `);
    const row = result[0]?.values[0];
    return row
      ? {
          id: Number(row[0]),
          caption: String(row[1]),
          keywords: String(row[2]),
          manualIndex: Number(row[3]),
          aiError: String(row[4])
        }
      : null;
  } finally {
    database.close();
  }
};

app.whenReady().then(async () => {
  const SQL = await initSqlJs({
    locateFile: (fileName) => require.resolve(`sql.js/dist/${fileName}`)
  });

  try {
    await fs.mkdir(path.dirname(databasePath), { recursive: true });
    await fs.mkdir(sourceDirectory, { recursive: true });
    await fs.writeFile(sourcePath, "manual-index-source");
    await fs.writeFile(unindexedSourcePath, "unindexed-manual-source");

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
        "exists" INTEGER NOT NULL DEFAULT 1 CHECK ("exists" IN (0, 1))
      );
    `);
    legacyDatabase.run(
      `
        INSERT INTO images (
          file_path, file_name, file_size, created_at, modified_at,
          caption, keywords, indexed_at, directory_id, "exists"
        ) VALUES (
          :file_path, :file_name, :file_size, :created_at, :modified_at,
          '', '', :indexed_at, :directory_id, 1
        )
      `,
      {
        ":file_path": sourcePath,
        ":file_name": path.basename(sourcePath),
        ":file_size": 19,
        ":created_at": initialTimestamp,
        ":modified_at": initialTimestamp,
        ":indexed_at": initialTimestamp,
        ":directory_id": directoryId
      }
    );
    await fs.writeFile(databasePath, legacyDatabase.export());
    legacyDatabase.close();

    const {
      deleteDirectoryImages,
      ensureImageDatabase,
      getPendingImageRecognitionCount,
      listPendingImageRecognitions,
      searchIndexedImages,
      upsertImageManualMetadata,
      updateImageRecognition,
      updateImageRecognitionFailure,
      writeScannedImagesToIndex
    } = require("../dist-electron/sqliteImageIndex.js");

    await ensureImageDatabase();

    const migratedDatabase = await loadRawDatabase(SQL);
    const migratedColumns = migratedDatabase.exec("PRAGMA table_info(images)")[0]?.values ?? [];
    migratedDatabase.close();
    assert.ok(migratedColumns.some((column) => String(column[1]) === "manual_index"));
    assert.equal((await readIndexedRow(SQL)).manualIndex, 0);

    await updateImageRecognition(1, "旧描述", ["旧关键词"], initialTimestamp);
    const sourceStat = await fs.stat(sourcePath);
    await upsertImageManualMetadata(
      {
        directory_id: directoryId,
        directory_path: sourceDirectory,
        file_path: sourcePath,
        file_name: path.basename(sourcePath),
        file_size: sourceStat.size,
        created_at: sourceStat.birthtime.toISOString(),
        modified_at: sourceStat.mtime.toISOString()
      },
      "手动产品描述",
      ["新关键词", "产品A"],
      new Date("2026-06-15T01:00:00.000Z").toISOString()
    );

    const manualRow = await readIndexedRow(SQL);
    assert.equal(manualRow.caption, "手动产品描述");
    assert.equal(manualRow.keywords, "新关键词,产品A");
    assert.equal(manualRow.manualIndex, 1);
    assert.equal(manualRow.aiError, "");

    const baseSearch = {
      directoryId: "all",
      sortField: "file_name",
      sortDirection: "asc",
      recognitionStatus: "all"
    };
    const manualSearchResult = await searchIndexedImages({ ...baseSearch, query: "新关键词" });
    assert.equal(manualSearchResult.images.length, 1);
    assert.equal(manualSearchResult.images[0].manualIndex, true);
    assert.equal((await searchIndexedImages({ ...baseSearch, query: "旧关键词" })).images.length, 0);

    const unindexedSourceStat = await fs.stat(unindexedSourcePath);
    await upsertImageManualMetadata(
      {
        directory_id: directoryId,
        directory_path: sourceDirectory,
        file_path: unindexedSourcePath,
        file_name: path.basename(unindexedSourcePath),
        file_size: unindexedSourceStat.size,
        created_at: unindexedSourceStat.birthtime.toISOString(),
        modified_at: unindexedSourceStat.mtime.toISOString()
      },
      "未识别文件的人工描述",
      ["新建人工索引"],
      new Date("2026-06-15T01:30:00.000Z").toISOString()
    );
    const createdManualRow = await readIndexedRow(SQL, unindexedSourcePath);
    assert.equal(createdManualRow.caption, "未识别文件的人工描述");
    assert.equal(createdManualRow.keywords, "新建人工索引");
    assert.equal(createdManualRow.manualIndex, 1);
    const createdManualSearchResult = await searchIndexedImages({
      ...baseSearch,
      query: "新建人工索引"
    });
    assert.equal(createdManualSearchResult.images.length, 1);
    assert.equal(createdManualSearchResult.images[0].manualIndex, true);

    assert.equal(await getPendingImageRecognitionCount(), 0);
    assert.deepEqual(await listPendingImageRecognitions(10), []);

    await updateImageRecognition(1, "模型覆盖描述", ["模型覆盖关键词"], new Date().toISOString());
    await updateImageRecognitionFailure(1, "模型失败覆盖", new Date().toISOString());
    assert.deepEqual(await readIndexedRow(SQL), manualRow);

    await writeScannedImagesToIndex(
      [directoryId],
      [{
        directory_id: directoryId,
        directory_path: sourceDirectory,
        file_path: sourcePath,
        file_name: path.basename(sourcePath),
        file_size: sourceStat.size,
        created_at: sourceStat.birthtime.toISOString(),
        modified_at: sourceStat.mtime.toISOString()
      }],
      new Date("2026-06-15T02:00:00.000Z").toISOString()
    );
    const rescannedRow = await readIndexedRow(SQL);
    assert.equal(rescannedRow.caption, manualRow.caption);
    assert.equal(rescannedRow.keywords, manualRow.keywords);
    assert.equal(rescannedRow.manualIndex, 1);

    await deleteDirectoryImages(directoryId);
    await writeScannedImagesToIndex(
      [directoryId],
      [{
        directory_id: directoryId,
        directory_path: sourceDirectory,
        file_path: sourcePath,
        file_name: path.basename(sourcePath),
        file_size: sourceStat.size,
        created_at: sourceStat.birthtime.toISOString(),
        modified_at: sourceStat.mtime.toISOString()
      }],
      new Date("2026-06-15T03:00:00.000Z").toISOString()
    );
    const readdedRow = await readIndexedRow(SQL);
    assert.equal(readdedRow.caption, "");
    assert.equal(readdedRow.keywords, "");
    assert.equal(readdedRow.manualIndex, 0);
    assert.equal(await getPendingImageRecognitionCount(), 1);

    console.log(JSON.stringify({
      migrationAddedManualIndex: true,
      manualSearchMatches: 1,
      unindexedManualSearchMatches: 1,
      oldSearchMatches: 0,
      pendingAfterManualEdit: 0,
      rescanPreservedManualIndex: true,
      readdedManualIndex: readdedRow.manualIndex
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
