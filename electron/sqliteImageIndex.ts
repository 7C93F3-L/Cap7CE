import { app } from "electron";
import { createRequire } from "node:module";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import initSqlJs from "sql.js";
import type { Database, SqlJsStatic, SqlValue } from "sql.js";
import type { ScannedFile, ScannedImageFile } from "./imageScanner";
import type { PersistedDirectory } from "./directoryStore";
import { getFileFormatCapability } from "./formatCapabilities";
import { applyKeywordBatchDelta, formatKeywordText, normalizeKeywordList, parseKeywordText } from "./keywordRules";
import { escapeSqlLikeTerm, getDirectoryTermMatches, getRelativeDirectoryEvidence, SEARCH_PATH_EVIDENCE_VERSION, toSearchTerms } from "./searchPathEvidence";
import { supportedVisualFileExtensionSet } from "./supportedVisualFormats";

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
  includedExtensions?: string[];
}

export type RecognitionFailureType = "parse" | "file" | "pending";

export interface ImageSearchResult {
  id: string;
  resultKind: "visual" | "file";
  filePath: string;
  fileName: string;
  extension: string;
  iconName: string;
  previewKind: "image" | "fileInfo" | "text" | "audio" | "video" | "pdf" | "office" | "archive" | "font" | "epub" | "mobi";
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

const backfillFileCatalogFromImages = (database: Database) => {
  const migrationKey = "file_catalog_backfill_v1";
  const migrationCompleted = database.exec(
    "SELECT value FROM index_metadata WHERE key = :key",
    { ":key": migrationKey }
  )[0]?.values[0]?.[0] === "completed";
  if (migrationCompleted) return;

  database.run("BEGIN TRANSACTION");
  try {
    const rows = database.exec(`
      SELECT file_path, file_name, file_size, created_at, modified_at, indexed_at, directory_id, "exists"
      FROM images
    `)[0]?.values ?? [];
    const statement = database.prepare(`
      INSERT OR IGNORE INTO files (
        file_path,
        file_name,
        extension,
        file_size,
        created_at,
        modified_at,
        indexed_at,
        directory_id,
        "exists"
      ) VALUES (
        :file_path,
        :file_name,
        :extension,
        :file_size,
        :created_at,
        :modified_at,
        :indexed_at,
        :directory_id,
        :exists
      )
    `);
    try {
      for (const row of rows) {
        const fileName = String(row[1]);
        statement.run({
          ":file_path": String(row[0]),
          ":file_name": fileName,
          ":extension": path.extname(fileName).toLowerCase(),
          ":file_size": Number(row[2]),
          ":created_at": String(row[3]),
          ":modified_at": String(row[4]),
          ":indexed_at": String(row[5]),
          ":directory_id": String(row[6]),
          ":exists": Number(row[7] ?? 1)
        });
        statement.reset();
      }
    } finally {
      statement.free();
    }
    database.run(
      "INSERT OR REPLACE INTO index_metadata (key, value) VALUES (:key, 'completed')",
      { ":key": migrationKey }
    );
    database.run("COMMIT");
  } catch (error) {
    try {
      database.run("ROLLBACK");
    } catch {
      // Preserve the original migration error.
    }
    throw error;
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

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      extension TEXT NOT NULL,
      relative_directory TEXT NOT NULL DEFAULT '',
      path_evidence_version INTEGER NOT NULL DEFAULT 0,
      file_size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      modified_at TEXT NOT NULL,
      user_keywords TEXT NOT NULL DEFAULT '',
      user_keywords_at TEXT,
      indexed_at TEXT NOT NULL,
      directory_id TEXT NOT NULL,
      "exists" INTEGER NOT NULL DEFAULT 1 CHECK ("exists" IN (0, 1))
    );

    CREATE INDEX IF NOT EXISTS idx_files_directory_exists
      ON files (directory_id, "exists");

    CREATE INDEX IF NOT EXISTS idx_files_file_name
      ON files (file_name);

    CREATE INDEX IF NOT EXISTS idx_files_extension
      ON files (extension);

    CREATE TABLE IF NOT EXISTS directory_file_scans (
      directory_id TEXT PRIMARY KEY,
      scanned_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS index_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  ensureColumn(database, "images", "ai_error", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, "images", "ai_failed_at", "TEXT");
  ensureColumn(database, "images", "manual_index", "INTEGER NOT NULL DEFAULT 0 CHECK (manual_index IN (0, 1))");
  ensureColumn(database, "files", "relative_directory", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, "files", "path_evidence_version", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "files", "user_keywords", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, "files", "user_keywords_at", "TEXT");
  backfillFileCatalogFromImages(database);
};

const firstResultValue = (database: Database, sql: string, params?: Record<string, SqlValue>) => {
  const result = database.exec(sql, params);
  return result[0]?.values[0]?.[0];
};

const ensurePathEvidenceMigrationBackup = async () => {
  const databasePath = getImageDatabasePath();
  const backupPath = `${databasePath}.pre-path-v1.bak`;
  try {
    await fs.copyFile(databasePath, backupPath, fsConstants.COPYFILE_EXCL);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "EEXIST") throw error;
  }
};

export const ensureImageDatabase = async () => {
  await ensurePathEvidenceMigrationBackup();
  const database = await loadDatabase();
  await saveDatabase(database);
  database.close();
};

export const backfillFilePathEvidence = async (directories: PersistedDirectory[]) => {
  const directoryById = new Map(directories.map((directory) => [directory.id, directory]));
  const database = await loadDatabase();
  let updatedCount = 0;
  try {
    const rows = database.exec(
      "SELECT id, file_path, directory_id FROM files WHERE path_evidence_version < :version",
      { ":version": SEARCH_PATH_EVIDENCE_VERSION }
    )[0]?.values ?? [];
    if (rows.length === 0) return 0;

    database.run("BEGIN TRANSACTION");
    const statement = database.prepare(`
      UPDATE files
      SET relative_directory = :relative_directory,
          path_evidence_version = :path_evidence_version
      WHERE id = :id
    `);
    try {
      for (const row of rows) {
        const directory = directoryById.get(String(row[2]));
        if (!directory) continue;
        const relativeDirectory = getRelativeDirectoryEvidence(directory.path, String(row[1]));
        if (relativeDirectory === null) continue;
        statement.run({
          ":id": Number(row[0]),
          ":relative_directory": relativeDirectory,
          ":path_evidence_version": SEARCH_PATH_EVIDENCE_VERSION
        });
        statement.reset();
        updatedCount += 1;
      }
    } finally {
      statement.free();
    }
    database.run("COMMIT");
    if (updatedCount > 0) await saveDatabase(database);
    return updatedCount;
  } catch (error) {
    try {
      database.run("ROLLBACK");
    } catch {
      // Preserve the original migration error.
    }
    throw error;
  } finally {
    database.close();
  }
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

export const getCompletedFileScanDirectoryIds = async (directoryIds: string[]): Promise<Set<string>> => {
  if (directoryIds.length === 0) return new Set();
  const requestedDirectoryIds = new Set(directoryIds);
  const database = await loadDatabase();
  try {
    const rows = database.exec("SELECT directory_id FROM directory_file_scans")[0]?.values ?? [];
    return new Set(
      rows.map((row) => String(row[0])).filter((directoryId) => requestedDirectoryIds.has(directoryId))
    );
  } finally {
    database.close();
  }
};

export const getExistingFileCountsByDirectory = async (directoryIds: string[]): Promise<Record<string, number>> => {
  const counts: Record<string, number> = Object.fromEntries(directoryIds.map((id) => [id, 0]));
  if (directoryIds.length === 0) return counts;
  const database = await loadDatabase();
  try {
    const statement = database.prepare('SELECT COUNT(*) FROM files WHERE directory_id = :directory_id AND "exists" = 1');
    try {
      for (const directoryId of directoryIds) {
        const value = statement.get({ ":directory_id": directoryId })[0];
        counts[directoryId] = typeof value === "number" ? value : 0;
        statement.reset();
      }
    } finally {
      statement.free();
    }
    return counts;
  } finally {
    database.close();
  }
};

export const writeScannedImagesToIndex = async (
  directoryIds: string[],
  images: ScannedImageFile[],
  indexedAt: string,
  files?: ScannedFile[]
): Promise<Record<string, number>> => {
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

    const markMissingFileStatement = files === undefined ? null : database.prepare(`
      UPDATE files
      SET "exists" = 0,
          indexed_at = :indexed_at
      WHERE directory_id = :directory_id
    `);
    const upsertFileStatement = database.prepare(`
      INSERT INTO files (
        file_path,
        file_name,
        extension,
        relative_directory,
        path_evidence_version,
        file_size,
        created_at,
        modified_at,
        indexed_at,
        directory_id,
        "exists"
      ) VALUES (
        :file_path,
        :file_name,
        :extension,
        :relative_directory,
        :path_evidence_version,
        :file_size,
        :created_at,
        :modified_at,
        :indexed_at,
        :directory_id,
        1
      )
      ON CONFLICT(file_path) DO UPDATE SET
        file_name = excluded.file_name,
        extension = excluded.extension,
        relative_directory = excluded.relative_directory,
        path_evidence_version = excluded.path_evidence_version,
        file_size = excluded.file_size,
        created_at = excluded.created_at,
        modified_at = excluded.modified_at,
        indexed_at = excluded.indexed_at,
        directory_id = excluded.directory_id,
        "exists" = 1
    `);
    const markFileScanStatement = files === undefined ? null : database.prepare(`
      INSERT INTO directory_file_scans (directory_id, scanned_at)
      VALUES (:directory_id, :scanned_at)
      ON CONFLICT(directory_id) DO UPDATE SET scanned_at = excluded.scanned_at
    `);

    try {
      for (const directoryId of directoryIds) {
        markMissingStatement.run({
          ":directory_id": directoryId,
          ":indexed_at": indexedAt
        });
        markMissingFileStatement?.run({
          ":directory_id": directoryId,
          ":indexed_at": indexedAt
        });
        markFileScanStatement?.run({
          ":directory_id": directoryId,
          ":scanned_at": indexedAt
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
      const catalogFiles: Array<ScannedFile | (ScannedImageFile & { extension: string })> = files ?? images.map((image) => ({
        ...image,
        extension: path.extname(image.file_name).toLowerCase()
      }));
      for (const file of catalogFiles) {
        const relativeDirectory = getRelativeDirectoryEvidence(file.directory_path, file.file_path) ?? "";
        upsertFileStatement.run({
          ":file_path": file.file_path,
          ":file_name": file.file_name,
          ":extension": file.extension,
          ":relative_directory": relativeDirectory,
          ":path_evidence_version": SEARCH_PATH_EVIDENCE_VERSION,
          ":file_size": file.file_size,
          ":created_at": file.created_at,
          ":modified_at": file.modified_at,
          ":indexed_at": indexedAt,
          ":directory_id": file.directory_id
        });
      }
    } finally {
      markMissingStatement.free();
      upsertStatement.free();
      markMissingFileStatement?.free();
      upsertFileStatement.free();
      markFileScanStatement?.free();
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

    database.run("BEGIN TRANSACTION");
    database.run(
      `
        DELETE FROM images
        WHERE directory_id = :directory_id
      `,
      {
        ":directory_id": directoryId
      }
    );
    database.run("DELETE FROM files WHERE directory_id = :directory_id", { ":directory_id": directoryId });
    database.run("DELETE FROM directory_file_scans WHERE directory_id = :directory_id", { ":directory_id": directoryId });
    database.run("COMMIT");
    await saveDatabase(database);
    return filePaths;
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

export const reassignDirectoryImages = async (
  replacements: Array<{ fromDirectoryIds: string[]; toDirectoryId: string; toDirectoryPath?: string }>
): Promise<void> => {
  const effectiveReplacements = replacements.filter((replacement) => replacement.fromDirectoryIds.length > 0);
  if (effectiveReplacements.length === 0) {
    return;
  }

  const database = await loadDatabase();
  try {
    database.run("BEGIN TRANSACTION");
    const statement = database.prepare(`
      UPDATE images
      SET directory_id = :to_directory_id
      WHERE directory_id = :from_directory_id
    `);
    const fileStatement = database.prepare(`
      UPDATE files
      SET directory_id = :to_directory_id
      WHERE directory_id = :from_directory_id
    `);
    const selectFilesStatement = database.prepare(`
      SELECT id, file_path
      FROM files
      WHERE directory_id = :directory_id
    `);
    const updatePathEvidenceStatement = database.prepare(`
      UPDATE files
      SET relative_directory = :relative_directory,
          path_evidence_version = :path_evidence_version
      WHERE id = :id
    `);
    const clearScanStatement = database.prepare(`
      DELETE FROM directory_file_scans
      WHERE directory_id = :directory_id
    `);
    try {
      for (const replacement of effectiveReplacements) {
        clearScanStatement.run({ ":directory_id": replacement.toDirectoryId });
        clearScanStatement.reset();
        for (const fromDirectoryId of replacement.fromDirectoryIds) {
          statement.run({
            ":to_directory_id": replacement.toDirectoryId,
            ":from_directory_id": fromDirectoryId
          });
          statement.reset();
          fileStatement.run({
            ":to_directory_id": replacement.toDirectoryId,
            ":from_directory_id": fromDirectoryId
          });
          fileStatement.reset();
          clearScanStatement.run({ ":directory_id": fromDirectoryId });
          clearScanStatement.reset();
        }
        if (replacement.toDirectoryPath) {
          selectFilesStatement.bind({ ":directory_id": replacement.toDirectoryId });
          while (selectFilesStatement.step()) {
            const row = selectFilesStatement.get();
            const relativeDirectory = getRelativeDirectoryEvidence(replacement.toDirectoryPath, String(row[1]));
            if (relativeDirectory === null) continue;
            updatePathEvidenceStatement.run({
              ":id": Number(row[0]),
              ":relative_directory": relativeDirectory,
              ":path_evidence_version": SEARCH_PATH_EVIDENCE_VERSION
            });
            updatePathEvidenceStatement.reset();
          }
          selectFilesStatement.reset();
        }
      }
    } finally {
      statement.free();
      fileStatement.free();
      selectFilesStatement.free();
      updatePathEvidenceStatement.free();
      clearScanStatement.free();
    }
    database.run("COMMIT");
    await saveDatabase(database);
  } catch (error) {
    try {
      database.run("ROLLBACK");
    } catch {
      // Preserve the original migration error.
    }
    throw error;
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

export const findCatalogRecordFilePaths = async (filePaths: string[]): Promise<string[]> => {
  if (filePaths.length === 0) return [];
  const database = await loadDatabase();
  try {
    const storedFilePathKeys = new Set(
      (database.exec("SELECT file_path FROM files")[0]?.values ?? [])
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
    const storedImageFilePaths = (database.exec("SELECT file_path FROM images")[0]?.values ?? [])
      .map((row) => String(row[0]))
      .filter((filePath) => targetPathKeys.has(normalizeImageFilePathKey(filePath)));
    const storedCatalogFilePaths = (database.exec("SELECT file_path FROM files")[0]?.values ?? [])
      .map((row) => String(row[0]))
      .filter((filePath) => targetPathKeys.has(normalizeImageFilePathKey(filePath)));
    if (storedImageFilePaths.length === 0 && storedCatalogFilePaths.length === 0) {
      return;
    }
    database.run("BEGIN TRANSACTION");
    const imageStatement = database.prepare(`
      DELETE FROM images
      WHERE file_path = :file_path
    `);
    const fileStatement = database.prepare(`
      DELETE FROM files
      WHERE file_path = :file_path
    `);
    try {
      for (const filePath of storedImageFilePaths) {
        imageStatement.run({ ":file_path": filePath });
      }
      for (const filePath of storedCatalogFilePaths) {
        fileStatement.run({ ":file_path": filePath });
      }
    } finally {
      imageStatement.free();
      fileStatement.free();
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

const upsertFileCatalogFromImageRecord = (
  database: Database,
  image: ScannedImageFile,
  indexedAt: string
) => {
  database.run(`
    INSERT INTO files (
      file_path, file_name, extension, file_size, created_at, modified_at,
      relative_directory, path_evidence_version, indexed_at, directory_id, "exists"
    ) VALUES (
      :file_path, :file_name, :extension, :file_size, :created_at, :modified_at,
      :relative_directory, :path_evidence_version, :indexed_at, :directory_id, 1
    )
    ON CONFLICT(file_path) DO UPDATE SET
      file_name = excluded.file_name,
      extension = excluded.extension,
      file_size = excluded.file_size,
      created_at = excluded.created_at,
      modified_at = excluded.modified_at,
      relative_directory = excluded.relative_directory,
      path_evidence_version = excluded.path_evidence_version,
      indexed_at = excluded.indexed_at,
      directory_id = excluded.directory_id,
      "exists" = 1
  `, {
    ":file_path": image.file_path,
    ":file_name": image.file_name,
    ":extension": path.extname(image.file_name).toLowerCase(),
    ":file_size": image.file_size,
    ":created_at": image.created_at,
    ":modified_at": image.modified_at,
    ":relative_directory": getRelativeDirectoryEvidence(image.directory_path, image.file_path) ?? "",
    ":path_evidence_version": SEARCH_PATH_EVIDENCE_VERSION,
    ":indexed_at": indexedAt,
    ":directory_id": image.directory_id
  });
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
    upsertFileCatalogFromImageRecord(database, image, indexedAt);
    await saveDatabase(database);
  } finally {
    database.close();
  }
};

export const upsertFileManualKeywords = async (
  file: ScannedImageFile,
  keywords: string[],
  updatedAt: string
): Promise<void> => {
  const database = await loadDatabase();

  try {
    database.run("BEGIN TRANSACTION");
    upsertFileCatalogFromImageRecord(database, file, updatedAt);
    database.run(`
      UPDATE files
      SET user_keywords = :user_keywords,
          user_keywords_at = :user_keywords_at
      WHERE file_path = :file_path COLLATE NOCASE
    `, {
      ":file_path": file.file_path,
      ":user_keywords": formatKeywordText(keywords),
      ":user_keywords_at": updatedAt
    });
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

export interface ManualKeywordBatchTarget {
  file: ScannedImageFile;
  resultKind: "visual" | "file";
}

export const updateManualKeywordsBatch = async (
  targets: ManualKeywordBatchTarget[],
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
      const rows = target.resultKind === "visual"
        ? database.exec(`
          SELECT file_path, keywords
          FROM images
          WHERE file_path = :file_path COLLATE NOCASE
          LIMIT 1
        `, { ":file_path": target.file.file_path })[0]?.values ?? []
        : database.exec(`
          SELECT file_path, user_keywords
          FROM files
          WHERE file_path = :file_path COLLATE NOCASE
          LIMIT 1
        `, { ":file_path": target.file.file_path })[0]?.values ?? [];

      const existingFilePath = rows.length > 0 ? String(rows[0][0]) : target.file.file_path;
      const existingKeywords = rows.length > 0
        ? parseKeywordText(String(rows[0][1] ?? ""))
        : [];
      const nextKeywords = applyKeywordBatchDelta(
        existingKeywords,
        normalizedInitialKeywords,
        normalizedTargetKeywords
      );

      const normalizedFile = { ...target.file, file_path: existingFilePath };
      if (target.resultKind === "visual") {
        upsertImageManualMetadataRecord(
          database,
          normalizedFile,
          "",
          nextKeywords,
          indexedAt,
          true
        );
      }
      upsertFileCatalogFromImageRecord(database, normalizedFile, indexedAt);
      if (target.resultKind === "file") {
        database.run(`
          UPDATE files
          SET user_keywords = :user_keywords,
              user_keywords_at = :user_keywords_at
          WHERE file_path = :file_path COLLATE NOCASE
        `, {
          ":file_path": normalizedFile.file_path,
          ":user_keywords": formatKeywordText(nextKeywords),
          ":user_keywords_at": indexedAt
        });
      }
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

export const listIndexedFilePaths = async (directoryId?: string): Promise<string[]> => {
  const database = await loadDatabase();
  try {
    const rows = database.exec(
      `
        SELECT file_path
        FROM files
        ${directoryId ? "WHERE directory_id = :directory_id" : ""}
      `,
      directoryId ? { ":directory_id": directoryId } : undefined
    )[0]?.values ?? [];
    return rows.map((row) => String(row[0]));
  } finally {
    database.close();
  }
};

export const deleteFilesByFilePaths = async (filePaths: string[]): Promise<void> => {
  if (filePaths.length === 0) return;
  const database = await loadDatabase();
  try {
    const targetPathKeys = new Set(filePaths.map(normalizeImageFilePathKey));
    const storedFilePaths = (database.exec("SELECT file_path FROM files")[0]?.values ?? [])
      .map((row) => String(row[0]))
      .filter((filePath) => targetPathKeys.has(normalizeImageFilePathKey(filePath)));
    if (storedFilePaths.length === 0) return;
    database.run("BEGIN TRANSACTION");
    const statement = database.prepare("DELETE FROM files WHERE file_path = :file_path");
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

export interface FileCatalogSearchResult {
  id: string;
  filePath: string;
  fileName: string;
  extension: string;
  fileSize: number;
  createdAt: string;
  modifiedAt: string;
  indexedAt: string;
}

export type IndexedCatalogSearchResponse = ImageSearchResponse & {
  availableFormats: string[];
  directoryIdByFilePath: Record<string, string>;
  knownCatalogVisualFilePaths: string[];
  knownVisualFilePaths: string[];
};

const catalogRecognizedClause = "TRIM(COALESCE(i.keywords, '')) <> '' AND (TRIM(COALESCE(i.caption, '')) <> '' OR i.manual_index = 1)";
const catalogUnrecognizedClause = `NOT (${catalogRecognizedClause})`;

const appendCatalogFileFormatFilter = (
  where: string[],
  params: Record<string, SqlValue>,
  fileFormat: string
) => {
  if (fileFormat === "all") return;
  if (fileFormat === "jpg") {
    where.push("f.extension IN ('.jpg', '.jpeg')");
    return;
  }
  if (fileFormat === "tif") {
    where.push("f.extension IN ('.tif', '.tiff')");
    return;
  }
  where.push("f.extension = :catalog_extension");
  params[":catalog_extension"] = `.${fileFormat}`;
};

const appendIncludedExtensionsFilter = (
  where: string[],
  params: Record<string, SqlValue>,
  includedExtensions: string[] | undefined,
  prefix: string,
  column = "f.extension"
) => {
  if (!includedExtensions) return;
  const normalizedExtensions = [...new Set(includedExtensions
    .filter((extension) => /^\.[a-z0-9]+$/i.test(extension))
    .map((extension) => extension.toLowerCase()))];
  if (normalizedExtensions.length === 0) {
    where.push("1 = 0");
    return;
  }
  const keys = normalizedExtensions.map((extension, index) => {
    const key = `:${prefix}_${index}`;
    params[key] = extension;
    return key;
  });
  where.push(`${column} IN (${keys.join(", ")})`);
};

const appendVisualExtensionParams = (params: Record<string, SqlValue>, prefix: string) => {
  const keys: string[] = [];
  [...supportedVisualFileExtensionSet].forEach((extension, index) => {
    const key = `:${prefix}_${index}`;
    keys.push(key);
    params[key] = extension;
  });
  return keys;
};

export const searchIndexedCatalog = async (
  search: ImageSearchState,
  directories: PersistedDirectory[]
): Promise<IndexedCatalogSearchResponse> => {
  const database = await loadDatabase();
  const terms = toSearchTerms(search.query);
  const selectedDirectories = search.directoryId === "all"
    ? directories
    : directories.filter((directory) => directory.id === search.directoryId);
  const directoryTermMatches = getDirectoryTermMatches(selectedDirectories, terms);
  const params: Record<string, SqlValue> = {};
  const where = ['f."exists" = 1'];

  if (search.directoryId !== "all") {
    where.push("f.directory_id = :catalog_directory_id");
    params[":catalog_directory_id"] = search.directoryId;
  }

  appendCatalogFileFormatFilter(where, params, normalizeFileFormat(search.fileFormat));
  appendIncludedExtensionsFilter(where, params, search.includedExtensions, "catalog_included_extension");
  if (search.recognitionStatus === "recognized") {
    where.push(`i.id IS NOT NULL AND (${catalogRecognizedClause})`);
  } else if (search.recognitionStatus === "unrecognized") {
    const visualExtensionKeys = appendVisualExtensionParams(params, "catalog_visual_extension");
    where.push(`f.extension IN (${visualExtensionKeys.join(", ")}) AND (i.id IS NULL OR (${catalogUnrecognizedClause}))`);
  }

  terms.forEach((term, termIndex) => {
    const fuzzyKey = `:catalog_term_${termIndex}`;
    const keywordKey = `:catalog_keyword_${termIndex}`;
    params[fuzzyKey] = escapeSqlLikeTerm(term);
    params[keywordKey] = term;
    const directoryKeys = [...(directoryTermMatches[termIndex] ?? [])].map((directoryId, directoryIndex) => {
      const key = `:catalog_term_${termIndex}_directory_${directoryIndex}`;
      params[key] = directoryId;
      return key;
    });
    where.push(`(
      LOWER(f.file_name) LIKE ${fuzzyKey} ESCAPE '\\'
      OR LOWER(f.extension) LIKE ${fuzzyKey} ESCAPE '\\'
      OR LOWER(f.relative_directory) LIKE ${fuzzyKey} ESCAPE '\\'
      ${directoryKeys.length > 0 ? `OR f.directory_id IN (${directoryKeys.join(", ")})` : ""}
      OR LOWER(COALESCE(i.caption, '')) LIKE ${fuzzyKey} ESCAPE '\\'
      OR INSTR(
        ',' || LOWER(REPLACE(COALESCE(i.keywords, ''), '，', ',')) || ',',
        ',' || ${keywordKey} || ','
      ) > 0
      OR INSTR(
        ',' || LOWER(REPLACE(COALESCE(f.user_keywords, ''), '，', ',')) || ',',
        ',' || ${keywordKey} || ','
      ) > 0
    )`);
  });

  const sortColumn = search.sortField === "modified_at" ? "f.modified_at" : "f.file_name";
  const sortDirection = sortDirections[search.sortDirection] ?? sortDirections.asc;

  try {
    const rows = database.exec(`
      SELECT
        f.id,
        f.file_path,
        f.file_name,
        f.extension,
        f.file_size,
        f.created_at,
        f.modified_at,
        f.indexed_at,
        f.relative_directory,
        f.directory_id,
        i.id,
        i.image_width,
        i.image_height,
        i.caption,
        i.keywords,
        i.ai_error,
        i.manual_index,
        i.indexed_at,
        f.user_keywords
      FROM files AS f
      LEFT JOIN images AS i
        ON i.file_path = f.file_path
       AND i."exists" = 1
      WHERE ${where.join(" AND ")}
      ORDER BY ${sortColumn} ${sortDirection}, f.id ASC
    `, params)[0]?.values ?? [];

    const images: ImageSearchResult[] = [];
    const directoryIdByFilePath: Record<string, string> = {};
    for (const row of rows) {
      const filePath = String(row[1]);
      const fileName = String(row[2]);
      const extension = String(row[3]).toLowerCase();
      const capability = getFileFormatCapability(extension);
      if (!capability?.canSearch) continue;
      const isVisual = capability.canAIIndex;
      const imageId = row[10] === null ? null : Number(row[10]);
      const aiError = imageId === null ? "" : String(row[15] ?? "");
      const failure = imageId === null
        ? { type: "pending" as const, label: t("recognition.pending") }
        : classifyRecognitionFailure(aiError);
      images.push({
        id: imageId === null ? `file:${filePath}` : String(imageId),
        resultKind: isVisual ? "visual" : "file",
        filePath,
        fileName,
        extension,
        iconName: isVisual ? "skim-file" : capability.iconName,
        previewKind: capability.previewKind,
        fileSize: Number(row[4] ?? 0),
        createdAt: String(row[5] ?? ""),
        modifiedAt: String(row[6] ?? ""),
        imageWidth: imageId === null ? 0 : Number(row[11] ?? 0),
        imageHeight: imageId === null ? 0 : Number(row[12] ?? 0),
        caption: imageId === null ? "" : String(row[13] ?? ""),
        keywords: isVisual
          ? imageId === null ? [] : parseKeywordText(String(row[14] ?? ""))
          : parseKeywordText(String(row[18] ?? "")),
        aiError,
        manualIndex: imageId !== null && Number(row[16] ?? 0) === 1,
        failureType: failure.type,
        failureLabel: isVisual ? failure.label : "",
        indexedAt: imageId === null ? String(row[7] ?? "") : String(row[17] ?? ""),
        thumbnailUrl: isVisual ? toThumbnailUrl(filePath) : ""
      });
      directoryIdByFilePath[filePath] = String(row[9]);
    }

    const visualStateParams: Record<string, SqlValue> = {};
    const visualStateWhere = ['f."exists" = 1'];
    if (search.directoryId !== "all") {
      visualStateWhere.push("f.directory_id = :visual_state_directory_id");
      visualStateParams[":visual_state_directory_id"] = search.directoryId;
    }
    const visualStateExtensionKeys = appendVisualExtensionParams(visualStateParams, "visual_state_extension");
    visualStateWhere.push(`f.extension IN (${visualStateExtensionKeys.join(", ")})`);
    appendIncludedExtensionsFilter(
      visualStateWhere,
      visualStateParams,
      search.includedExtensions,
      "visual_state_included_extension"
    );
    const visualStateRows = database.exec(`
      SELECT f.file_path, f.extension, i.id, i.caption, i.keywords, i.manual_index
      FROM files AS f
      LEFT JOIN images AS i
        ON i.file_path = f.file_path
       AND i."exists" = 1
      WHERE ${visualStateWhere.join(" AND ")}
    `, visualStateParams)[0]?.values ?? [];
    const knownCatalogVisualFilePaths: string[] = [];
    const knownVisualFilePaths: string[] = [];
    const selectedFileFormat = normalizeFileFormat(search.fileFormat);
    let unrecognizedCount = 0;
    for (const row of visualStateRows) {
      const filePath = String(row[0]);
      const extension = normalizeFileFormat(String(row[1]).replace(/^\./, ""));
      const imageId = row[2] === null ? null : Number(row[2]);
      knownCatalogVisualFilePaths.push(filePath);
      if (imageId !== null) knownVisualFilePaths.push(filePath);
      const matchesSelectedFormat = selectedFileFormat === "all" || selectedFileFormat === extension;
      const recognized = imageId !== null
        && String(row[4] ?? "").trim() !== ""
        && (String(row[3] ?? "").trim() !== "" || Number(row[5] ?? 0) === 1);
      if (matchesSelectedFormat && !recognized) unrecognizedCount += 1;
    }
    const failureStats = images.reduce((stats, image) => {
      if (image.failureType === "file") stats.fileFailures += 1;
      else if (image.failureType === "parse") stats.parseFailures += 1;
      return stats;
    }, { parseFailures: 0, fileFailures: 0 });

    return {
      images,
      availableFormats: [],
      directoryIdByFilePath,
      knownCatalogVisualFilePaths,
      knownVisualFilePaths,
      unrecognizedCount,
      skippedUnrecognizedCount: terms.length > 0 && search.recognitionStatus !== "unrecognized" ? unrecognizedCount : 0,
      failureStats
    };
  } finally {
    database.close();
  }
};

export const searchIndexedFiles = async (search: ImageSearchState): Promise<FileCatalogSearchResult[]> => {
  if (search.recognitionStatus !== "all") return [];
  const database = await loadDatabase();
  const terms = toSearchTerms(search.query);
  const params: Record<string, SqlValue> = {};
  const where = ['"exists" = 1'];

  if (search.directoryId !== "all") {
    where.push("directory_id = :directory_id");
    params[":directory_id"] = search.directoryId;
  }

  const fileFormat = normalizeFileFormat(search.fileFormat);
  if (fileFormat === "jpg") {
    where.push("extension IN ('.jpg', '.jpeg')");
  } else if (fileFormat === "tif") {
    where.push("extension IN ('.tif', '.tiff')");
  } else if (fileFormat !== "all") {
    where.push("extension = :extension");
    params[":extension"] = `.${fileFormat}`;
  }

  terms.forEach((term, index) => {
    const key = `:file_term_${index}`;
    where.push(`LOWER(file_name) LIKE ${key}`);
    params[key] = `%${term}%`;
  });

  const sortColumn = sortFieldColumns[search.sortField] ?? sortFieldColumns.file_name;
  const sortDirection = sortDirections[search.sortDirection] ?? sortDirections.asc;

  try {
    const rows = database.exec(
      `
        SELECT id, file_path, file_name, extension, file_size, created_at, modified_at, indexed_at
        FROM files
        WHERE ${where.join(" AND ")}
        ORDER BY ${sortColumn} ${sortDirection}, id ASC
      `,
      params
    )[0]?.values ?? [];
    const files: FileCatalogSearchResult[] = [];
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
      files.push({
        id: `catalog:${id}`,
        filePath,
        fileName: String(row[2]),
        extension: String(row[3]).toLowerCase(),
        fileSize: Number(row[4] ?? 0),
        createdAt: String(row[5] ?? ""),
        modifiedAt: String(row[6] ?? ""),
        indexedAt: String(row[7] ?? "")
      });
    }

    if (missingIds.length > 0) {
      const statement = database.prepare('UPDATE files SET "exists" = 0, indexed_at = :indexed_at WHERE id = :id');
      try {
        const indexedAt = new Date().toISOString();
        for (const id of missingIds) {
          statement.run({ ":id": id, ":indexed_at": indexedAt });
        }
      } finally {
        statement.free();
      }
      await saveDatabase(database);
    }

    return files;
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
        resultKind: "visual",
        filePath,
        fileName: String(row[2]),
        extension: path.extname(String(row[2])).toLowerCase(),
        iconName: "skim-file",
        previewKind: getFileFormatCapability(path.extname(String(row[2])).toLowerCase())?.previewKind ?? "image",
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
