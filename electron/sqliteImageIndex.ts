import { app } from "electron";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import initSqlJs from "sql.js";
import type { Database, SqlJsStatic, SqlValue } from "sql.js";
import type { ScannedImageFile } from "./imageScanner";
import { applyKeywordBatchDelta, formatKeywordText, normalizeKeywordList, parseKeywordText } from "./keywordRules";

const requireFromHere = createRequire(__filename);

const indexDirectory = () => path.join(app.getPath("userData"), "index");
export const getImageDatabasePath = () => path.join(indexDirectory(), `${["image", "everything"].join("-")}.db`);

export interface PendingImageRecognitionItem {
  id: number;
  filePath: string;
  fileName: string;
}

export interface ImageSearchState {
  query: string;
  directoryId: string;
  fileFormat: string;
  sortField: "file_name" | "modified_at";
  sortDirection: "asc" | "desc";
  recognitionStatus: "all" | "recognized" | "unrecognized";
}

export type RecognitionFailureType = "parse" | "file" | "pending";

export interface ImageSearchResult {
  id: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  createdAt: string;
  modifiedAt: string;
  imageWidth: number;
  imageHeight: number;
  caption: string;
  keywords: string[];
  aiError: string;
  manualIndex: boolean;
  failureType: RecognitionFailureType;
  failureLabel: string;
  indexedAt: string;
  thumbnailUrl: string;
}

export interface ImageSearchResponse {
  images: ImageSearchResult[];
  unrecognizedCount: number;
  skippedUnrecognizedCount: number;
  failureStats: {
    parseFailures: number;
    fileFailures: number;
  };
}

export interface IndexQualityStats {
  totalImages: number;
  recognizedImages: number;
  unrecognizedImages: number;
}

const sortFieldColumns: Record<ImageSearchState["sortField"], string> = {
  file_name: "file_name",
  modified_at: "modified_at"
};

const sortDirections: Record<ImageSearchState["sortDirection"], "ASC" | "DESC"> = {
  asc: "ASC",
  desc: "DESC"
};

const recognizedImageClause = "TRIM(keywords) <> '' AND (TRIM(caption) <> '' OR manual_index = 1)";
const unrecognizedImageClause = `NOT (${recognizedImageClause})`;

const toSearchTerms = (query: string) => query.trim().toLowerCase().split(/\s+/).filter(Boolean);

const normalizeFileFormat = (value: unknown) => {
  const normalized = typeof value === "string" ? value.trim().replace(/^\./, "").toLowerCase() : "";
  if (!normalized || !/^[a-z0-9]+$/.test(normalized)) return "all";
  if (normalized === "jpeg") return "jpg";
  if (normalized === "tiff") return "tif";
  return normalized;
};

const appendFileFormatFilter = (where: string[], params: Record<string, SqlValue>, fileFormat: string) => {
  if (fileFormat === "all") return;
  if (fileFormat === "jpg") {
    where.push("(LOWER(file_name) LIKE :file_format_jpg OR LOWER(file_name) LIKE :file_format_jpeg)");
    params[":file_format_jpg"] = "%.jpg";
    params[":file_format_jpeg"] = "%.jpeg";
    return;
  }
  if (fileFormat === "tif") {
    where.push("(LOWER(file_name) LIKE :file_format_tif OR LOWER(file_name) LIKE :file_format_tiff)");
    params[":file_format_tif"] = "%.tif";
    params[":file_format_tiff"] = "%.tiff";
    return;
  }
  where.push("LOWER(file_name) LIKE :file_format");
  params[":file_format"] = `%.${fileFormat}`;
};

const toThumbnailUrl = (filePath: string) => `cap7ce://thumbnail/?path=${encodeURIComponent(filePath)}`;

export const normalizeImageFilePathKey = (filePath: string) => {
  const resolvedPath = path.normalize(path.resolve(filePath));
  const rootPath = path.parse(resolvedPath).root;
  const withoutTrailingSeparators = resolvedPath.length > rootPath.length
    ? resolvedPath.replace(/[\\/]+$/, "")
    : resolvedPath;
  return process.platform === "win32" ? withoutTrailingSeparators.toLocaleLowerCase() : withoutTrailingSeparators;
};

const fileErrorPatterns = [
  /图片读取失败/i,
  /图片文件为空/i,
  /图片格式无法解码/i,
  /文件已损坏/i,
  /图片损坏/i,
  /格式异常/i,
  /无法读取/i,
  /尺寸异常/i,
  /无法解码/i,
  /unsupported image/i,
  /invalid image/i,
  /corrupt/i,
  /decode/i
];

const classifyRecognitionFailure = (aiError: string): { type: RecognitionFailureType; label: string } => {
  const normalizedError = aiError.trim();
  if (!normalizedError) {
    return { type: "pending", label: t("recognition.pending") };
  }

  if (fileErrorPatterns.some((pattern) => pattern.test(normalizedError))) {
    return { type: "file", label: t("recognition.fileError") };
  }

  return { type: "parse", label: t("recognition.parseFailed") };
};

let sqlRuntimePromise: Promise<SqlJsStatic> | null = null;

const getSqlRuntime = () => {
  if (!sqlRuntimePromise) {
    sqlRuntimePromise = initSqlJs({
      locateFile: (fileName) => requireFromHere.resolve(`sql.js/dist/${fileName}`)
    });
  }

  return sqlRuntimePromise;
};

const loadDatabase = async (): Promise<Database> => {
  const SQL = await getSqlRuntime();
  const databasePath = getImageDatabasePath();

  try {
    const data = await fs.readFile(databasePath);
    const database = new SQL.Database(data);
    migrate(database);
    return database;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }

    const database = new SQL.Database();
    migrate(database);
    return database;
  }
};

const saveDatabase = async (database: Database) => {
  const directory = indexDirectory();
  const databasePath = getImageDatabasePath();
  const tempPath = `${databasePath}.tmp`;

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(tempPath, database.export());
  await fs.rename(tempPath, databasePath);
};

const ensureColumn = (database: Database, tableName: string, columnName: string, definition: string) => {
  const columns = database.exec(`PRAGMA table_info(${tableName})`)[0]?.values ?? [];
  const exists = columns.some((column) => String(column[1]) === columnName);
  if (!exists) {
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
};

const migrate = (database: Database) => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS images (
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

    CREATE INDEX IF NOT EXISTS idx_images_directory_exists
      ON images (directory_id, "exists");

    CREATE INDEX IF NOT EXISTS idx_images_file_name
      ON images (file_name);
  `);

  ensureColumn(database, "images", "ai_error", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, "images", "ai_failed_at", "TEXT");
  ensureColumn(database, "images", "manual_index", "INTEGER NOT NULL DEFAULT 0 CHECK (manual_index IN (0, 1))");
};

const firstResultValue = (database: Database, sql: string, params?: Record<string, SqlValue>) => {
  const result = database.exec(sql, params);
  return result[0]?.values[0]?.[0];
};

export const ensureImageDatabase = async () => {
  const database = await loadDatabase();
  await saveDatabase(database);
  database.close();
};

export const getExistingImageCountsByDirectory = async (directoryIds: string[]): Promise<Record<string, number>> => {
  const counts: Record<string, number> = Object.fromEntries(directoryIds.map((id) => [id, 0]));
  const database = await loadDatabase();

  try {
    const statement = database.prepare('SELECT COUNT(*) FROM images WHERE directory_id = :directory_id AND "exists" = 1');
    try {
      for (const directoryId of directoryIds) {
        const value = statement.get({ ":directory_id": directoryId })[0];
        counts[directoryId] = typeof value === "number" ? value : 0;
        statement.reset();
      }
    } finally {
      statement.free();
    }
  } finally {
    database.close();
  }

  return counts;
};

export const writeScannedImagesToIndex = async (directoryIds: string[], images: ScannedImageFile[], indexedAt: string): Promise<Record<string, number>> => {
  const database = await loadDatabase();

  try {
    database.run("BEGIN TRANSACTION");

    const markMissingStatement = database.prepare(`
      UPDATE images
      SET "exists" = 0,
          indexed_at = :indexed_at
      WHERE directory_id = :directory_id
    `);

    const upsertStatement = database.prepare(`
      INSERT INTO images (
        file_path,
        file_name,
        file_size,
        created_at,
        modified_at,
        image_width,
        image_height,
        caption,
        keywords,
        indexed_at,
        directory_id,
        "exists"
      ) VALUES (
        :file_path,
        :file_name,
        :file_size,
        :created_at,
        :modified_at,
        :image_width,
        :image_height,
        '',
        '',
        :indexed_at,
        :directory_id,
        1
      )
      ON CONFLICT(file_path) DO UPDATE SET
        file_name = excluded.file_name,
        file_size = excluded.file_size,
        created_at = excluded.created_at,
        modified_at = excluded.modified_at,
        image_width = COALESCE(excluded.image_width, images.image_width),
        image_height = COALESCE(excluded.image_height, images.image_height),
        indexed_at = excluded.indexed_at,
        directory_id = excluded.directory_id,
        "exists" = 1
    `);

    try {
      for (const directoryId of directoryIds) {
        markMissingStatement.run({
          ":directory_id": directoryId,
          ":indexed_at": indexedAt
        });
      }

      for (const image of images) {
        upsertStatement.run({
          ":file_path": image.file_path,
          ":file_name": image.file_name,
          ":file_size": image.file_size,
          ":created_at": image.created_at,
          ":modified_at": image.modified_at,
          ":image_width": null,
          ":image_height": null,
          ":indexed_at": indexedAt,
          ":directory_id": image.directory_id
        });
      }
    } finally {
      markMissingStatement.free();
      upsertStatement.free();
    }

    database.run("COMMIT");
    await saveDatabase(database);

    const counts = await countExistingImagesByDirectory(database, directoryIds);
    return counts;
  } catch (error) {
    try {
      database.run("ROLLBACK");
    } catch {
      // Ignore rollback failures so the original database error is preserved.
    }
    throw error;
  } finally {
    database.close();
  }
};

export const listPendingImageRecognitions = async (limit: number, excludedIds: number[] = [], directoryId?: string): Promise<PendingImageRecognitionItem[]> => {
  const database = await loadDatabase();
  const safeExcludedIds = excludedIds.filter((id) => Number.isInteger(id) && id > 0);
  const excludedClause = safeExcludedIds.length > 0 ? `AND id NOT IN (${safeExcludedIds.join(",")})` : "";
  const directoryClause = directoryId ? "AND directory_id = :directory_id" : "";

  try {
    const result = database.exec(
      `
        SELECT id, file_path, file_name
        FROM images
        WHERE "exists" = 1
          AND manual_index = 0
          AND (TRIM(caption) = '' OR TRIM(keywords) = '')
          ${directoryClause}
          ${excludedClause}
        ORDER BY indexed_at ASC, id ASC
        LIMIT :limit
      `,
      {
        ":limit": limit,
        ...(directoryId ? { ":directory_id": directoryId } : {})
      }
    );

    return (result[0]?.values ?? []).map((row) => ({
      id: Number(row[0]),
      filePath: String(row[1]),
      fileName: String(row[2])
    }));
  } finally {
    database.close();
  }
};

export const getPendingImageRecognitionCount = async (directoryId?: string): Promise<number> => {
  const database = await loadDatabase();
  const directoryClause = directoryId ? "AND directory_id = :directory_id" : "";

  try {
    const value = firstResultValue(
      database,
      `
        SELECT COUNT(*)
        FROM images
        WHERE "exists" = 1
          AND manual_index = 0
          AND (TRIM(caption) = '' OR TRIM(keywords) = '')
          ${directoryClause}
      `,
      directoryId ? { ":directory_id": directoryId } : undefined
    );
    return typeof value === "number" ? value : 0;
  } finally {
    database.close();
  }
};

export const listRecognizedImageFilePaths = async (): Promise<string[]> => {
  const database = await loadDatabase();

  try {
    return (database.exec(
      `
        SELECT file_path
        FROM images
        WHERE "exists" = 1
          AND ${recognizedImageClause}
      `
    )[0]?.values ?? []).map((row) => String(row[0]));
  } finally {
    database.close();
  }
};

export const deleteDirectoryImages = async (directoryId: string): Promise<string[]> => {
  const database = await loadDatabase();

  try {
    const filePaths = (database.exec(
      `
        SELECT file_path
        FROM images
        WHERE directory_id = :directory_id
      `,
      {
        ":directory_id": directoryId
      }
    )[0]?.values ?? []).map((row) => String(row[0]));

    database.run(
      `
        DELETE FROM images
        WHERE directory_id = :directory_id
      `,
      {
        ":directory_id": directoryId
      }
    );
    await saveDatabase(database);
    return filePaths;
  } finally {
    database.close();
  }
};

export const findImageRecordFilePaths = async (filePaths: string[]): Promise<string[]> => {
  if (filePaths.length === 0) {
    return [];
  }

  const database = await loadDatabase();

  try {
    const storedFilePathKeys = new Set(
      (database.exec("SELECT file_path FROM images")[0]?.values ?? [])
        .map((row) => normalizeImageFilePathKey(String(row[0])))
    );
    return filePaths.filter((filePath) => storedFilePathKeys.has(normalizeImageFilePathKey(filePath)));
  } finally {
    database.close();
  }
};

export const deleteImagesByFilePaths = async (filePaths: string[]): Promise<void> => {
  if (filePaths.length === 0) {
    return;
  }

  const database = await loadDatabase();

  try {
    const targetPathKeys = new Set(filePaths.map(normalizeImageFilePathKey));
    const storedFilePaths = (database.exec("SELECT file_path FROM images")[0]?.values ?? [])
      .map((row) => String(row[0]))
      .filter((filePath) => targetPathKeys.has(normalizeImageFilePathKey(filePath)));
    if (storedFilePaths.length === 0) {
      return;
    }
    database.run("BEGIN TRANSACTION");
    const statement = database.prepare(`
      DELETE FROM images
      WHERE file_path = :file_path
    `);
    try {
      for (const filePath of storedFilePaths) {
        statement.run({ ":file_path": filePath });
      }
    } finally {
      statement.free();
    }
    database.run("COMMIT");
    await saveDatabase(database);
  } catch (error) {
    try {
      database.run("ROLLBACK");
    } catch {
      // Preserve the original database error.
    }
    throw error;
  } finally {
    database.close();
  }
};

export const updateImageRecognition = async (id: number, caption: string, keywords: string[], indexedAt: string) => {
  const database = await loadDatabase();

  try {
    database.run(
      `
        UPDATE images
        SET caption = :caption,
            keywords = :keywords,
            indexed_at = :indexed_at,
            ai_error = '',
            ai_failed_at = NULL
        WHERE id = :id
          AND manual_index = 0
      `,
      {
        ":id": id,
        ":caption": caption,
        ":keywords": formatKeywordText(keywords),
        ":indexed_at": indexedAt
      }
    );
    await saveDatabase(database);
  } finally {
    database.close();
  }
};

export const updateImageRecognitionFailure = async (id: number, message: string, indexedAt: string) => {
  const database = await loadDatabase();

  try {
    database.run(
      `
        UPDATE images
        SET caption = '',
            keywords = '',
            ai_error = :ai_error,
            ai_failed_at = :ai_failed_at,
            indexed_at = :indexed_at
        WHERE id = :id
          AND manual_index = 0
      `,
      {
        ":id": id,
        ":ai_error": message.slice(0, 500),
        ":ai_failed_at": indexedAt,
        ":indexed_at": indexedAt
      }
    );
    await saveDatabase(database);
  } finally {
    database.close();
  }
};

const upsertImageManualMetadataRecord = (
  database: Database,
  image: ScannedImageFile,
  caption: string,
  keywords: string[],
  indexedAt: string,
  preserveExistingCaption: boolean
) => {
  database.run(
    `
        INSERT INTO images (
          file_path,
          file_name,
          file_size,
          created_at,
          modified_at,
          image_width,
          image_height,
          caption,
          keywords,
          indexed_at,
          directory_id,
          ai_error,
          ai_failed_at,
          manual_index,
          "exists"
        ) VALUES (
          :file_path,
          :file_name,
          :file_size,
          :created_at,
          :modified_at,
          NULL,
          NULL,
          :caption,
          :keywords,
          :indexed_at,
          :directory_id,
          '',
          NULL,
          1,
          1
        )
        ON CONFLICT(file_path) DO UPDATE SET
          file_name = excluded.file_name,
          file_size = excluded.file_size,
          created_at = excluded.created_at,
          modified_at = excluded.modified_at,
          caption = CASE
            WHEN :preserve_existing_caption = 1 THEN images.caption
            ELSE excluded.caption
          END,
          keywords = excluded.keywords,
          indexed_at = excluded.indexed_at,
          directory_id = excluded.directory_id,
          ai_error = '',
          ai_failed_at = NULL,
          manual_index = 1,
          "exists" = 1
    `,
    {
      ":file_path": image.file_path,
      ":file_name": image.file_name,
      ":file_size": image.file_size,
      ":created_at": image.created_at,
      ":modified_at": image.modified_at,
      ":caption": caption,
      ":keywords": formatKeywordText(keywords),
      ":indexed_at": indexedAt,
      ":directory_id": image.directory_id,
      ":preserve_existing_caption": preserveExistingCaption ? 1 : 0
    }
  );
};

export const upsertImageManualMetadata = async (
  image: ScannedImageFile,
  caption: string,
  keywords: string[],
  indexedAt: string
): Promise<void> => {
  const database = await loadDatabase();

  try {
    upsertImageManualMetadataRecord(database, image, caption, keywords, indexedAt, false);
    await saveDatabase(database);
  } finally {
    database.close();
  }
};

export interface ImageKeywordBatchTarget {
  image: ScannedImageFile;
}

export const updateImageKeywordsBatch = async (
  targets: ImageKeywordBatchTarget[],
  initialCommonKeywords: string[],
  targetKeywordText: string
): Promise<string[]> => {
  const database = await loadDatabase();
  const normalizedInitialKeywords = normalizeKeywordList(initialCommonKeywords);
  const normalizedTargetKeywords = parseKeywordText(targetKeywordText);
  const indexedAt = new Date().toISOString();

  try {
    database.run("BEGIN TRANSACTION");

    for (const target of targets) {
      const rows = database.exec(
        `
          SELECT file_path, keywords
          FROM images
          WHERE file_path = :file_path COLLATE NOCASE
          LIMIT 1
        `,
        {
          ":file_path": target.image.file_path
        }
      )[0]?.values ?? [];

      const existingFilePath = rows.length > 0 ? String(rows[0][0]) : target.image.file_path;
      const existingKeywords = rows.length > 0
        ? parseKeywordText(String(rows[0][1] ?? ""))
        : [];
      const nextKeywords = applyKeywordBatchDelta(
        existingKeywords,
        normalizedInitialKeywords,
        normalizedTargetKeywords
      );

      upsertImageManualMetadataRecord(
        database,
        { ...target.image, file_path: existingFilePath },
        "",
        nextKeywords,
        indexedAt,
        true
      );
    }

    database.run("COMMIT");
    await saveDatabase(database);
    return normalizedTargetKeywords;
  } catch (error) {
    try {
      database.run("ROLLBACK");
    } catch {
      // Preserve the original transaction error.
    }
    throw error;
  } finally {
    database.close();
  }
};

export const getImageIndexQualityStats = async (directoryId?: string): Promise<IndexQualityStats> => {
  const database = await loadDatabase();
  const directoryClause = directoryId ? "AND directory_id = :directory_id" : "";

  try {
    const row = database.exec(
      `
        SELECT
          COUNT(*),
          SUM(CASE WHEN ${recognizedImageClause} THEN 1 ELSE 0 END),
          SUM(CASE WHEN ${unrecognizedImageClause} THEN 1 ELSE 0 END)
        FROM images
        WHERE "exists" = 1
          ${directoryClause}
      `,
      directoryId ? { ":directory_id": directoryId } : undefined
    )[0]?.values[0] ?? [0, 0, 0];

    return {
      totalImages: Number(row[0] ?? 0),
      recognizedImages: Number(row[1] ?? 0),
      unrecognizedImages: Number(row[2] ?? 0)
    };
  } finally {
    database.close();
  }
};

const countUnrecognizedImages = (database: Database, search: ImageSearchState) => {
  const params: Record<string, SqlValue> = {};
  const where = ['"exists" = 1', unrecognizedImageClause];

  if (search.directoryId !== "all") {
    where.push("directory_id = :directory_id");
    params[":directory_id"] = search.directoryId;
  }

  const fileFormat = normalizeFileFormat(search.fileFormat);
  appendFileFormatFilter(where, params, fileFormat);

  const value = firstResultValue(database, `SELECT COUNT(*) FROM images WHERE ${where.join(" AND ")}`, params);
  return typeof value === "number" ? value : 0;
};

export const listExistingImageFilePaths = async (directoryId: string): Promise<Set<string>> => {
  const database = await loadDatabase();
  const params: Record<string, SqlValue> = {};
  const where = ['"exists" = 1'];

  if (directoryId !== "all") {
    where.push("directory_id = :directory_id");
    params[":directory_id"] = directoryId;
  }

  try {
    const rows = database.exec(
      `
        SELECT file_path
        FROM images
        WHERE ${where.join(" AND ")}
      `,
      params
    )[0]?.values ?? [];

    return new Set(rows.map((row) => String(row[0])));
  } finally {
    database.close();
  }
};

export const listIndexedImageFilePaths = async (directoryId?: string): Promise<string[]> => {
  const database = await loadDatabase();

  try {
    const rows = database.exec(
      `
        SELECT file_path
        FROM images
        ${directoryId ? "WHERE directory_id = :directory_id" : ""}
      `,
      directoryId ? { ":directory_id": directoryId } : undefined
    )[0]?.values ?? [];

    return rows.map((row) => String(row[0]));
  } finally {
    database.close();
  }
};

export const searchIndexedImages = async (search: ImageSearchState): Promise<ImageSearchResponse> => {
  const database = await loadDatabase();
  const terms = toSearchTerms(search.query);
  const params: Record<string, SqlValue> = {};
  const where = ['"exists" = 1'];

  if (search.directoryId !== "all") {
    where.push("directory_id = :directory_id");
    params[":directory_id"] = search.directoryId;
  }

  const fileFormat = normalizeFileFormat(search.fileFormat);
  appendFileFormatFilter(where, params, fileFormat);

  if (search.recognitionStatus === "recognized") {
    where.push(recognizedImageClause);
  } else if (search.recognitionStatus === "unrecognized") {
    where.push(unrecognizedImageClause);
  }

  terms.forEach((term, index) => {
    const fuzzyKey = `:term_${index}`;
    const keywordKey = `:keyword_${index}`;
    where.push(search.recognitionStatus === "unrecognized"
      ? `LOWER(file_name) LIKE ${fuzzyKey}`
      : `(
          LOWER(file_name) LIKE ${fuzzyKey}
          OR LOWER(caption) LIKE ${fuzzyKey}
          OR INSTR(
            ',' || LOWER(REPLACE(keywords, '，', ',')) || ',',
            ',' || ${keywordKey} || ','
          ) > 0
        )`);
    params[fuzzyKey] = `%${term}%`;
    params[keywordKey] = term;
  });

  const sortColumn = sortFieldColumns[search.sortField] ?? sortFieldColumns.file_name;
  const sortDirection = sortDirections[search.sortDirection] ?? sortDirections.asc;

  try {
    const result = database.exec(
      `
        SELECT
          id,
          file_path,
          file_name,
          file_size,
          created_at,
          modified_at,
          image_width,
          image_height,
          caption,
          keywords,
          ai_error,
          manual_index,
          indexed_at
        FROM images
        WHERE ${where.join(" AND ")}
        ORDER BY ${sortColumn} ${sortDirection}, id ASC
      `,
      params
    );

    const rows = result[0]?.values ?? [];
    const images: ImageSearchResult[] = [];
    const missingIds: number[] = [];

    for (const row of rows) {
      const id = Number(row[0]);
      const filePath = String(row[1]);

      try {
        await fs.access(filePath);
      } catch {
        missingIds.push(id);
        continue;
      }

      const keywords = parseKeywordText(String(row[9] ?? ""));
      const aiError = String(row[10] ?? "");
      const failure = classifyRecognitionFailure(aiError);

      images.push({
        id: String(id),
        filePath,
        fileName: String(row[2]),
        fileSize: Number(row[3] ?? 0),
        createdAt: String(row[4] ?? ""),
        modifiedAt: String(row[5] ?? ""),
        imageWidth: Number(row[6] ?? 0),
        imageHeight: Number(row[7] ?? 0),
        caption: String(row[8] ?? ""),
        keywords,
        aiError,
        manualIndex: Number(row[11] ?? 0) === 1,
        failureType: failure.type,
        failureLabel: failure.label,
        indexedAt: String(row[12] ?? ""),
        thumbnailUrl: toThumbnailUrl(filePath)
      });
    }

    if (missingIds.length > 0) {
      const statement = database.prepare('UPDATE images SET "exists" = 0, indexed_at = :indexed_at WHERE id = :id');
      try {
        for (const id of missingIds) {
          statement.run({
            ":id": id,
            ":indexed_at": new Date().toISOString()
          });
        }
      } finally {
        statement.free();
      }
      await saveDatabase(database);
    }

    const unrecognizedCount = countUnrecognizedImages(database, search);
    const failureStats = images.reduce(
      (stats, image) => {
        if (image.failureType === "file") {
          stats.fileFailures += 1;
        } else if (image.failureType === "parse") {
          stats.parseFailures += 1;
        }
        return stats;
      },
      { parseFailures: 0, fileFailures: 0 }
    );

    return {
      images,
      unrecognizedCount,
      skippedUnrecognizedCount: terms.length > 0 && search.recognitionStatus !== "unrecognized" ? unrecognizedCount : 0,
      failureStats
    };
  } finally {
    database.close();
  }
};

const countExistingImagesByDirectory = async (database: Database, directoryIds: string[]) => {
  const counts: Record<string, number> = Object.fromEntries(directoryIds.map((id) => [id, 0]));
  for (const directoryId of directoryIds) {
    const value = firstResultValue(database, 'SELECT COUNT(*) FROM images WHERE directory_id = :directory_id AND "exists" = 1', {
      ":directory_id": directoryId
    });
    counts[directoryId] = typeof value === "number" ? value : 0;
  }

  return counts;
};
import { t } from "./localization";
