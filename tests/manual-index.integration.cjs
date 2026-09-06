const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");
const initSqlJs = require("sql.js");

const testRoot = path.join(os.tmpdir(), `cap7ce-metadata-ownership-${process.pid}-${Date.now()}`);
const userDataPath = path.join(testRoot, "user-data");
const sourceDirectory = path.join(testRoot, "sources");
const aiSourcePath = path.join(sourceDirectory, "ai-source.png");
const manualSourcePath = path.join(sourceDirectory, "manual.webp");
const databasePath = path.join(userDataPath, "index", "cap7ce-index.db");
const directoryId = "metadata-ownership-directory";
const initialTimestamp = new Date("2026-06-15T00:00:00.000Z").toISOString();

app.setPath("userData", userDataPath);

const loadRawDatabase = async (SQL) => new SQL.Database(await fs.readFile(databasePath));

const readMetadata = async (SQL, targetPath) => {
  const database = await loadRawDatabase(SQL);
  try {
    const row = database.exec(`
      SELECT image.id, ai.caption, ai.keywords, ai.ai_error, user.description, user.keywords
      FROM images AS image
      LEFT JOIN image_ai_metadata AS ai ON ai.image_id = image.id
      LEFT JOIN file_user_metadata AS user ON user.file_path = image.file_path
      WHERE image.file_path = :file_path
    `, { ":file_path": targetPath })[0]?.values[0];
    return row ? {
      id: Number(row[0]),
      aiCaption: String(row[1] ?? ""),
      aiKeywords: String(row[2] ?? ""),
      aiError: String(row[3] ?? ""),
      userDescription: String(row[4] ?? ""),
      userKeywords: String(row[5] ?? "")
    } : null;
  } finally {
    database.close();
  }
};

app.whenReady().then(async () => {
  const SQL = await initSqlJs({ locateFile: (fileName) => require.resolve(`sql.js/dist/${fileName}`) });
  try {
    await fs.mkdir(path.dirname(databasePath), { recursive: true });
    await fs.mkdir(sourceDirectory, { recursive: true });
    await fs.writeFile(aiSourcePath, "ai-source");
    await fs.writeFile(manualSourcePath, "manual-source");

    const {
      deleteDirectoryImages,
      ensureImageDatabase,
      getImageIndexQualityStats,
      getPendingImageRecognitionCount,
      listPendingImageRecognitions,
      searchIndexedImages,
      updateImageRecognition,
      updateImageRecognitionFailure,
      upsertFileManualKeywords,
      writeScannedImagesToIndex
    } = require("../dist-electron/sqliteImageIndex.js");

    await ensureImageDatabase();
    const initializedDatabase = await loadRawDatabase(SQL);
    const userColumns = initializedDatabase.exec("PRAGMA table_info(file_user_metadata)")[0]?.values ?? [];
    const aiColumns = initializedDatabase.exec("PRAGMA table_info(image_ai_metadata)")[0]?.values ?? [];
    initializedDatabase.close();
    assert.ok(userColumns.some((column) => String(column[1]) === "description"));
    assert.ok(aiColumns.some((column) => String(column[1]) === "caption"));

    const aiStat = await fs.stat(aiSourcePath);
    const aiFile = {
      directory_id: directoryId,
      directory_path: sourceDirectory,
      file_path: aiSourcePath,
      file_name: path.basename(aiSourcePath),
      file_size: aiStat.size,
      created_at: aiStat.birthtime.toISOString(),
      modified_at: aiStat.mtime.toISOString()
    };
    const manualStat = await fs.stat(manualSourcePath);
    const manualFile = {
      directory_id: directoryId,
      directory_path: sourceDirectory,
      file_path: manualSourcePath,
      file_name: path.basename(manualSourcePath),
      file_size: manualStat.size,
      created_at: manualStat.birthtime.toISOString(),
      modified_at: manualStat.mtime.toISOString()
    };
    await writeScannedImagesToIndex([directoryId], [aiFile, manualFile], initialTimestamp);
    await updateImageRecognition(1, "初始 AI 描述", ["初始AI词"], initialTimestamp);
    await upsertFileManualKeywords(manualFile, ["人工词"], initialTimestamp);

    assert.deepEqual(await readMetadata(SQL, aiSourcePath), {
      id: 1, aiCaption: "初始 AI 描述", aiKeywords: "初始AI词", aiError: "",
      userDescription: "", userKeywords: ""
    });
    assert.deepEqual(await readMetadata(SQL, manualSourcePath), {
      id: 2, aiCaption: "", aiKeywords: "", aiError: "",
      userDescription: "", userKeywords: "人工词"
    });

    await upsertFileManualKeywords(aiFile, ["人工新增词", "产品A"], new Date("2026-06-15T01:00:00.000Z").toISOString());

    let separatedRow = await readMetadata(SQL, aiSourcePath);
    assert.equal(separatedRow.aiCaption, "初始 AI 描述");
    assert.equal(separatedRow.aiKeywords, "初始AI词");
    assert.equal(separatedRow.userKeywords, "人工新增词,产品A");

    const baseSearch = {
      directoryId: "all", fileFormat: "all", sortField: "file_name",
      sortDirection: "asc"
    };
    assert.equal((await searchIndexedImages({ ...baseSearch, query: "初始AI词" })).images.length, 1);
    const userSearch = await searchIndexedImages({ ...baseSearch, query: "人工新增词" });
    assert.equal(userSearch.images.length, 1);
    assert.deepEqual(userSearch.images[0].keywords, ["人工新增词", "产品A"]);
    assert.deepEqual(userSearch.images[0].aiKeywords, ["初始AI词"]);

    await updateImageRecognition(1, "新 AI 描述", ["新AI词"], new Date().toISOString());
    separatedRow = await readMetadata(SQL, aiSourcePath);
    assert.equal(separatedRow.aiCaption, "新 AI 描述");
    assert.equal(separatedRow.aiKeywords, "新AI词");
    assert.equal(separatedRow.userKeywords, "人工新增词,产品A");

    await updateImageRecognitionFailure(1, "模型解析失败", new Date().toISOString());
    separatedRow = await readMetadata(SQL, aiSourcePath);
    assert.equal(separatedRow.aiKeywords, "");
    assert.equal(separatedRow.aiError, "模型解析失败");
    assert.equal(separatedRow.userKeywords, "人工新增词,产品A");
    assert.equal((await searchIndexedImages({ ...baseSearch, query: "人工新增词" })).images.length, 1);

    assert.equal(await getPendingImageRecognitionCount(), 2);
    assert.deepEqual((await listPendingImageRecognitions(10)).map((item) => item.id), [1, 2]);
    assert.deepEqual(await getImageIndexQualityStats(directoryId), {
      totalFiles: 2, recognizedFiles: 2, unrecognizedFiles: 0,
      totalVisualImages: 2, pendingVisualImages: 0
    });

    await writeScannedImagesToIndex([directoryId], [aiFile, manualFile], new Date("2026-06-15T02:00:00.000Z").toISOString());
    assert.equal((await readMetadata(SQL, aiSourcePath)).userKeywords, "人工新增词,产品A");
    assert.equal((await readMetadata(SQL, manualSourcePath)).userKeywords, "人工词");

    await deleteDirectoryImages(directoryId);
    const deletedDatabase = await loadRawDatabase(SQL);
    const userMetadataCount = deletedDatabase.exec("SELECT COUNT(*) FROM file_user_metadata")[0]?.values[0]?.[0];
    const aiMetadataCount = deletedDatabase.exec("SELECT COUNT(*) FROM image_ai_metadata")[0]?.values[0]?.[0];
    deletedDatabase.close();
    assert.equal(Number(userMetadataCount), 0);
    assert.equal(Number(aiMetadataCount), 0);

    await writeScannedImagesToIndex([directoryId], [aiFile], new Date("2026-06-15T03:00:00.000Z").toISOString());
    const readded = await readMetadata(SQL, aiSourcePath);
    assert.equal(readded.aiCaption, "");
    assert.equal(readded.aiKeywords, "");
    assert.equal(readded.userKeywords, "");
    assert.equal(await getPendingImageRecognitionCount(), 1);

    console.log(JSON.stringify({
      currentMetadataSchemaInitialized: true,
      userAndAiKeywordsCoexist: true,
      aiUpdatePreservedUserKeywords: true,
      aiFailurePreservedUserKeywords: true,
      manualKeywordsDoNotBlockAiQueue: true,
      rescanPreservedSeparatedMetadata: true,
      directoryDeleteCascadedMetadata: true,
      readdedFileStartedClean: true
    }));
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
}).then(() => app.exit(0)).catch(async (error) => {
  console.error(error);
  await fs.rm(testRoot, { recursive: true, force: true }).catch(() => undefined);
  app.exit(1);
});
