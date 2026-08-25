import { app } from "electron";
import { createRequire } from "node:module";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import initSqlJs from "sql.js";
import type { Database, SqlJsStatic, SqlValue } from "sql.js";
import type { ScannedFile, ScannedImageFile } from "./imageScanner";
import type { PersistedDirectory } from "./directoryStore";
import { canUseSearchShellThumbnail, getFileFormatCapability } from "./formatCapabilities";
import { applyKeywordBatchDelta, normalizeKeywordList, parseKeywordText } from "./keywordRules";
import { escapeSqlLikeTerm, getDirectoryTermMatches, getRelativeDirectoryEvidence, SEARCH_PATH_EVIDENCE_VERSION, toSearchTerms } from "./searchPathEvidence";
import {
  getSearchableExtensionsForNaturalKind,
  planSearchQuery,
  type PlannedSearchTerm,
  type SearchQueryPlan
} from "./searchQueryPlanner";
import type { SearchResultEvidence } from "./searchEvidenceTypes";
import {
  ensureIndexMetadataSchema,
  readUserMetadata,
  updateUserKeywords,
  upsertAiRecognition,
  upsertAiRecognitionFailure
} from "./indexMetadataStore";
import { supportsEmbeddedMetadataExtraction } from "./embeddedMetadataExtractor";
import { readEmbeddedMetadataState, readEmbeddedSearchEvidence, replaceEmbeddedMetadata } from "./embeddedMetadataStore";
import type { PreviewEmbeddedMetadata } from "./previewTypes";
import { EMBEDDED_METADATA_EXTRACTOR_VERSION, type EmbeddedMetadataExtraction, type EmbeddedSearchEvidence } from "./embeddedMetadataTypes";
import { createFileSourceRevision } from "./fileSourceRevision";
import { deleteAiQueryEvidence, mergeAiQueryEvidence, type AiQueryEvidenceMerge } from "./aiQueryEvidenceStore";
import { inflateVisualPropertyValues, replaceVisualPropertyRecord, visualPropertyDatabaseColumns } from "./visualPropertyStore";
import {
  VISUAL_PROPERTY_ANALYZER_VERSION,
  type VisualPropertyAnalysisCandidate,
  type VisualPropertyVector,
  type VisualPropertyWriteRecord
} from "./visualPropertyTypes";
import type { VisualPropertyMetric, VisualPropertySemanticCondition } from "./visualPropertySemantics";
import { replaceAnimationFact } from "./animationFactStore";
import { ANIMATION_FACT_EXTRACTOR_VERSION, supportedAnimationFactExtensions, type AnimationFactCandidate, type AnimationFactWriteRecord } from "./animationFactTypes";
import {
  IMAGE_DIMENSION_EXTRACTOR_VERSION,
  supportedImageDimensionExtensions,
  type ImageDimensionCandidate,
  type ImageDimensionWriteRecord
} from "./imageDimensionTypes";

const requireFromHere = createRequire(__filename);

const indexDirectory = () => path.join(app.getPath("userData"), "index");
export const getImageDatabasePath = () => path.join(indexDirectory(), "cap7ce-index.db");
export const getLegacyImageDatabasePath = () => path.join(indexDirectory(), "image-everything.db");

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
  includedExtensions?: string[];
  aiQueryModelId?: string;
  aiQueryPromptVersion?: number;
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
  canShellPreview: boolean;
  fileSize: number;
  createdAt: string;
  modifiedAt: string;
  imageWidth: number;
  imageHeight: number;
  caption: string;
  keywords: string[];
  aiKeywords: string[];
  userDescription: string;
  isRecognized: boolean;
  aiError: string;
  failureType: RecognitionFailureType;
  failureLabel: string;
  indexedAt: string;
  thumbnailUrl: string;
  searchEvidence: SearchResultEvidence | null;
}

export interface ImageSearchResponse {
  images: ImageSearchResult[];
}

export interface IndexQualityStats {
  totalFiles: number;
  recognizedFiles: number;
  unrecognizedFiles: number;
  totalVisualImages: number;
  pendingVisualImages: number;
}

const sortFieldColumns: Record<ImageSearchState["sortField"], string> = {
  file_name: "file_name",
  modified_at: "modified_at"
};

const sortDirections: Record<ImageSearchState["sortDirection"], "ASC" | "DESC"> = {
  asc: "ASC",
  desc: "DESC"
};

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
const toSearchShellThumbnailUrl = (filePath: string) => `cap7ce://search-shell-thumbnail/?path=${encodeURIComponent(filePath)}`;

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
let databaseFileNameMigrationPromise: Promise<void> | null = null;
let databaseAccessQueue: Promise<void> = Promise.resolve();

const acquireDatabaseAccess = async () => {
  let release: () => void = () => undefined;
  const previous = databaseAccessQueue;
  databaseAccessQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  return release;
};

const getSqlRuntime = () => {
  if (!sqlRuntimePromise) {
    sqlRuntimePromise = initSqlJs({
      locateFile: (fileName) => requireFromHere.resolve(`sql.js/dist/${fileName}`)
    });
  }

  return sqlRuntimePromise;
};

export const migrateLegacyDatabaseFileName = async (
  databasePath = getImageDatabasePath(),
  legacyDatabasePath = getLegacyImageDatabasePath()
) => {
  const [databaseExists, legacyDatabaseExists] = await Promise.all([
    fs.stat(databasePath).then(() => true).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }),
    fs.stat(legacyDatabasePath).then(() => true).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    })
  ]);

  if (databaseExists) {
    if (legacyDatabaseExists) {
      console.warn("[sqlite-index] both current and legacy database files exist; using cap7ce-index.db without overwriting either file");
    }
    return;
  }
  if (!legacyDatabaseExists) return;

  const backupBasePath = `${legacyDatabasePath}.pre-cap7ce-name-v1.bak`;
  for (let suffix = 0; ; suffix += 1) {
    const backupPath = suffix === 0 ? backupBasePath : `${backupBasePath}.${suffix}`;
    try {
      await fs.copyFile(legacyDatabasePath, backupPath, fsConstants.COPYFILE_EXCL);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  await fs.rename(legacyDatabasePath, databasePath);
};

const ensureDatabaseFileNameMigration = () => {
  if (!databaseFileNameMigrationPromise) {
    databaseFileNameMigrationPromise = migrateLegacyDatabaseFileName();
  }
  return databaseFileNameMigrationPromise;
};

const loadDatabase = async (): Promise<Database> => {
  const release = await acquireDatabaseAccess();
  try {
    const SQL = await getSqlRuntime();
    await ensureDatabaseFileNameMigration();
    const databasePath = getImageDatabasePath();
    await ensureMetadataOwnershipMigrationBackup();
    let database: Database;
    try {
      database = new SQL.Database(await fs.readFile(databasePath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      database = new SQL.Database();
    }
    migrate(database);
    const close = database.close.bind(database);
    let closed = false;
    database.close = () => {
      if (closed) return;
      closed = true;
      try { close(); } finally { release(); }
    };
    return database;
  } catch (error) {
    release();
    throw error;
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
      indexed_at TEXT NOT NULL,
      directory_id TEXT NOT NULL,
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

  const hasLegacyImageMetadata = (database.exec("PRAGMA table_info(images)")[0]?.values ?? [])
    .some((column) => String(column[1]) === "caption");
  if (hasLegacyImageMetadata) {
    ensureColumn(database, "images", "ai_error", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(database, "images", "ai_failed_at", "TEXT");
    ensureColumn(database, "images", "manual_index", "INTEGER NOT NULL DEFAULT 0 CHECK (manual_index IN (0, 1))");
  }
  ensureColumn(database, "files", "relative_directory", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, "files", "path_evidence_version", "INTEGER NOT NULL DEFAULT 0");
  backfillFileCatalogFromImages(database);
  ensureIndexMetadataSchema(database);
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

const ensureMetadataOwnershipMigrationBackup = async () => {
  const databasePath = getImageDatabasePath();
  const backupPath = `${databasePath}.pre-metadata-ownership-v1.bak`;
  try {
    await fs.copyFile(databasePath, backupPath, fsConstants.COPYFILE_EXCL);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "EEXIST") throw error;
  }
};

export const ensureImageDatabase = async () => {
  await ensureDatabaseFileNameMigration();
  await ensurePathEvidenceMigrationBackup();
  const database = await loadDatabase();
  await saveDatabase(database);
  database.close();
};

export interface PendingEmbeddedMetadataCandidate {
  filePath: string;
  sourceRevision: string;
}

export interface EmbeddedMetadataWriteRecord {
  filePath: string;
  extraction: EmbeddedMetadataExtraction;
}

export const listPendingEmbeddedMetadataCandidates = async (
  directoryIds?: string[]
): Promise<PendingEmbeddedMetadataCandidate[]> => {
  const database = await loadDatabase();
  try {
    const requestedIds = new Set(directoryIds ?? []);
    const rows = database.exec(`
      SELECT file.file_path, file.extension, file.file_size, file.modified_at,
             state.source_revision, state.extractor_version, file.directory_id
      FROM files AS file
      LEFT JOIN file_embedded_metadata_state AS state ON state.file_id = file.id
      WHERE file."exists" = 1
      ORDER BY file.id
    `)[0]?.values ?? [];
    return rows.flatMap((row) => {
      const filePath = String(row[0]);
      const extension = String(row[1]);
      if (!supportsEmbeddedMetadataExtraction(extension)) return [];
      if (requestedIds.size > 0 && !requestedIds.has(String(row[6]))) return [];
      const sourceRevision = createFileSourceRevision({
        fileSize: Number(row[2]),
        modifiedAt: String(row[3])
      });
      return row[4] === sourceRevision && Number(row[5]) === EMBEDDED_METADATA_EXTRACTOR_VERSION
        ? []
        : [{ filePath, sourceRevision }];
    });
  } finally {
    database.close();
  }
};

export const writeEmbeddedMetadataBatch = async (
  records: EmbeddedMetadataWriteRecord[],
  indexedAt: string
) => {
  if (records.length === 0) return 0;
  const database = await loadDatabase();
  try {
    database.run("BEGIN TRANSACTION");
    for (const record of records) {
      replaceEmbeddedMetadata(database, record.filePath, record.extraction, indexedAt);
    }
    database.run("COMMIT");
    await saveDatabase(database);
    return records.length;
  } catch (error) {
    try { database.run("ROLLBACK"); } catch { /* Preserve the original error. */ }
    throw error;
  } finally {
    database.close();
  }
};

export const readPreviewEmbeddedMetadata = async (
  filePath: string,
  source: { fileSize: number; modifiedAt: string }
): Promise<{ metadata: PreviewEmbeddedMetadata | null; isCurrent: boolean }> => {
  const database = await loadDatabase();
  try {
    const state = readEmbeddedMetadataState(database, filePath);
    const sourceRevision = createFileSourceRevision(source);
    const isCurrent = state?.sourceRevision === sourceRevision
      && state.extractorVersion === EMBEDDED_METADATA_EXTRACTOR_VERSION;
    if (!isCurrent || state.status !== "indexed") return { metadata: null, isCurrent };
    const items = readEmbeddedSearchEvidence(database, filePath).map((item) => ({
      kind: item.kind,
      text: item.searchText
    }));
    const metadata = items.length === 0 && !state.capturedAt
      ? null
      : { items, capturedAt: state.capturedAt };
    return { metadata, isCurrent };
  } finally {
    database.close();
  }
};

const supportedImageDimensionExtensionSet = new Set<string>(supportedImageDimensionExtensions);

export const listPendingImageDimensionCandidates = async (
  directoryIds?: string[]
): Promise<ImageDimensionCandidate[]> => {
  const database = await loadDatabase();
  try {
    const requestedIds = new Set(directoryIds ?? []);
    const rows = database.exec(`
      SELECT image.file_path, image.file_size, image.modified_at, image.directory_id, file.extension
      FROM images AS image
      JOIN files AS file ON file.file_path = image.file_path
      WHERE image."exists" = 1
        AND file."exists" = 1
        AND (image.image_width IS NULL OR image.image_height IS NULL)
      ORDER BY image.id
    `)[0]?.values ?? [];
    return rows.flatMap((row) => {
      if (requestedIds.size > 0 && !requestedIds.has(String(row[3]))) return [];
      if (!supportedImageDimensionExtensionSet.has(String(row[4]).toLowerCase())) return [];
      return [{
        filePath: String(row[0]),
        sourceRevision: createFileSourceRevision({
          fileSize: Number(row[1]),
          modifiedAt: String(row[2])
        })
      }];
    });
  } finally {
    database.close();
  }
};

export const writeImageDimensionBatch = async (records: ImageDimensionWriteRecord[]) => {
  if (records.length === 0) return 0;
  const database = await loadDatabase();
  const readSource = database.prepare(`
    SELECT file_size, modified_at
    FROM images
    WHERE file_path = :file_path COLLATE NOCASE AND "exists" = 1
    LIMIT 1
  `);
  const updateDimensions = database.prepare(`
    UPDATE images
    SET image_width = :image_width,
        image_height = :image_height
    WHERE file_path = :file_path COLLATE NOCASE AND "exists" = 1
  `);
  let writtenCount = 0;
  try {
    database.run("BEGIN TRANSACTION");
    for (const record of records) {
      if (record.result.extractorVersion !== IMAGE_DIMENSION_EXTRACTOR_VERSION) continue;
      const source = readSource.get({ ":file_path": record.filePath });
      readSource.reset();
      if (source.length === 0) continue;
      const currentRevision = createFileSourceRevision({
        fileSize: Number(source[0]),
        modifiedAt: String(source[1])
      });
      if (currentRevision !== record.result.sourceRevision) continue;
      updateDimensions.run({
        ":file_path": record.filePath,
        ":image_width": record.result.status === "indexed" ? record.result.width : 0,
        ":image_height": record.result.status === "indexed" ? record.result.height : 0
      });
      writtenCount += 1;
    }
    database.run("COMMIT");
    if (writtenCount > 0) await saveDatabase(database);
    return writtenCount;
  } catch (error) {
    try { database.run("ROLLBACK"); } catch { /* Preserve the original error. */ }
    throw error;
  } finally {
    readSource.free();
    updateDimensions.free();
    database.close();
  }
};

const supportedAnimationFactExtensionSet = new Set<string>(supportedAnimationFactExtensions);

export const listPendingAnimationFactCandidates = async (directoryIds?: string[]): Promise<AnimationFactCandidate[]> => {
  const database = await loadDatabase();
  try {
    const requestedIds = new Set(directoryIds ?? []);
    const rows = database.exec(`
      SELECT file.file_path, file.extension, file.file_size, file.modified_at, file.directory_id,
             fact.source_revision, fact.extractor_version
      FROM files AS file
      LEFT JOIN file_animation_facts AS fact ON fact.file_id = file.id
      WHERE file."exists" = 1
      ORDER BY file.id
    `)[0]?.values ?? [];
    return rows.flatMap((row) => {
      if (!supportedAnimationFactExtensionSet.has(String(row[1]).toLowerCase())) return [];
      if (requestedIds.size > 0 && !requestedIds.has(String(row[4]))) return [];
      const sourceRevision = createFileSourceRevision({ fileSize: Number(row[2]), modifiedAt: String(row[3]) });
      return row[5] === sourceRevision && Number(row[6]) === ANIMATION_FACT_EXTRACTOR_VERSION
        ? []
        : [{ filePath: String(row[0]), sourceRevision }];
    });
  } finally { database.close(); }
};

export const writeAnimationFactBatch = async (records: AnimationFactWriteRecord[]) => {
  if (records.length === 0) return 0;
  const database = await loadDatabase();
  let written = 0;
  try {
    database.run("BEGIN TRANSACTION");
    for (const record of records) {
      if (record.result.extractorVersion !== ANIMATION_FACT_EXTRACTOR_VERSION) continue;
      const row = database.exec(`SELECT file_size, modified_at FROM files WHERE file_path = :file_path COLLATE NOCASE AND "exists" = 1 LIMIT 1`, { ":file_path": record.filePath })[0]?.values[0];
      if (!row) continue;
      const revision = createFileSourceRevision({ fileSize: Number(row[0]), modifiedAt: String(row[1]) });
      if (revision !== record.result.sourceRevision) continue;
      replaceAnimationFact(database, record.filePath, record.result, new Date().toISOString());
      written += 1;
    }
    database.run("COMMIT");
    if (written) await saveDatabase(database);
    return written;
  } catch (error) {
    try { database.run("ROLLBACK"); } catch { /* Preserve original error. */ }
    throw error;
  } finally { database.close(); }
};

export const filterPendingVisualPropertyCandidates = async (
  candidates: VisualPropertyAnalysisCandidate[]
): Promise<VisualPropertyAnalysisCandidate[]> => {
  if (candidates.length === 0) return [];
  const database = await loadDatabase();
  const statement = database.prepare(`
    SELECT file.file_size, file.modified_at, property.source_revision, property.analyzer_version
    FROM files AS file
    LEFT JOIN file_visual_properties AS property ON property.file_id = file.id
    WHERE file.file_path = :file_path COLLATE NOCASE AND file."exists" = 1
    LIMIT 1
  `);
  try {
    const pending: VisualPropertyAnalysisCandidate[] = [];
    for (const candidate of candidates) {
      const row = statement.get({ ":file_path": candidate.filePath });
      statement.reset();
      if (row.length === 0) continue;
      const indexedRevision = createFileSourceRevision({
        fileSize: Number(row[0]),
        modifiedAt: String(row[1])
      });
      if (indexedRevision !== candidate.sourceRevision) continue;
      if (String(row[2] ?? "") === candidate.sourceRevision && Number(row[3]) === VISUAL_PROPERTY_ANALYZER_VERSION) {
        continue;
      }
      pending.push(candidate);
    }
    return pending;
  } finally {
    statement.free();
    database.close();
  }
};

export const writeVisualPropertyBatch = async (
  records: VisualPropertyWriteRecord[],
  indexedAt: string
) => {
  if (records.length === 0) return 0;
  const database = await loadDatabase();
  const fileExists = database.prepare(`
    SELECT id FROM files WHERE file_path = :file_path COLLATE NOCASE AND "exists" = 1 LIMIT 1
  `);
  let writtenCount = 0;
  try {
    database.run("BEGIN TRANSACTION");
    for (const record of records) {
      const exists = fileExists.get({ ":file_path": record.filePath }).length > 0;
      fileExists.reset();
      if (!exists) continue;
      replaceVisualPropertyRecord(database, record.filePath, record.record, indexedAt);
      writtenCount += 1;
    }
    database.run("COMMIT");
    if (writtenCount > 0) await saveDatabase(database);
    return writtenCount;
  } catch (error) {
    try { database.run("ROLLBACK"); } catch { /* Preserve the original error. */ }
    throw error;
  } finally {
    fileExists.free();
    database.close();
  }
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
        :indexed_at,
        :directory_id,
        1
      )
      ON CONFLICT(file_path) DO UPDATE SET
        file_name = excluded.file_name,
        image_width = CASE
          WHEN images.file_size = excluded.file_size AND images.modified_at = excluded.modified_at
            THEN images.image_width
          ELSE NULL
        END,
        image_height = CASE
          WHEN images.file_size = excluded.file_size AND images.modified_at = excluded.modified_at
            THEN images.image_height
          ELSE NULL
        END,
        file_size = excluded.file_size,
        created_at = excluded.created_at,
        modified_at = excluded.modified_at,
        indexed_at = excluded.indexed_at,
        directory_id = excluded.directory_id,
        "exists" = 1
    `);
    const invalidateAiQueryEvidenceStatement = database.prepare(`
      DELETE FROM image_ai_query_cache
      WHERE image_id = (SELECT id FROM images WHERE file_path = :file_path)
        AND source_revision <> :source_revision
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
        invalidateAiQueryEvidenceStatement.run({
          ":file_path": image.file_path,
          ":source_revision": createFileSourceRevision({
            fileSize: image.file_size,
            modifiedAt: image.modified_at
          })
        });
        invalidateAiQueryEvidenceStatement.reset();
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
      invalidateAiQueryEvidenceStatement.free();
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
        FROM images AS image
        LEFT JOIN image_ai_metadata AS ai ON ai.image_id = image.id
        WHERE image."exists" = 1
          AND (TRIM(COALESCE(ai.caption, '')) = '' OR TRIM(COALESCE(ai.keywords, '')) = '')
          ${directoryClause}
          ${excludedClause}
        ORDER BY image.indexed_at ASC, image.id ASC
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
        FROM images AS image
        LEFT JOIN image_ai_metadata AS ai ON ai.image_id = image.id
        WHERE image."exists" = 1
          AND (TRIM(COALESCE(ai.caption, '')) = '' OR TRIM(COALESCE(ai.keywords, '')) = '')
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
        FROM images AS image
        INNER JOIN image_ai_metadata AS ai ON ai.image_id = image.id
        WHERE image."exists" = 1
          AND TRIM(ai.keywords) <> ''
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
    upsertAiRecognition(database, id, caption, keywords, indexedAt);
    await saveDatabase(database);
  } finally {
    database.close();
  }
};

export const updateImageRecognitionFailure = async (id: number, message: string, indexedAt: string) => {
  const database = await loadDatabase();

  try {
    upsertAiRecognitionFailure(database, id, message, indexedAt);
    await saveDatabase(database);
  } finally {
    database.close();
  }
};

export const mergeImageAiQueryEvidence = async (entries: AiQueryEvidenceMerge[]) => {
  const database = await loadDatabase();
  try {
    mergeAiQueryEvidence(database, entries);
    await saveDatabase(database);
  } finally {
    database.close();
  }
};

export const deleteImageAiQueryEvidence = async (imageIds: number[]) => {
  const database = await loadDatabase();
  try {
    deleteAiQueryEvidence(database, imageIds);
    await saveDatabase(database);
  } finally {
    database.close();
  }
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

export const upsertFileManualKeywords = async (
  file: ScannedImageFile,
  keywords: string[],
  updatedAt: string
): Promise<void> => {
  const database = await loadDatabase();

  try {
    database.run("BEGIN TRANSACTION");
    upsertFileCatalogFromImageRecord(database, file, updatedAt);
    updateUserKeywords(database, file.file_path, keywords, updatedAt);
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
      const rows = database.exec(`
        SELECT file_path
        FROM files
        WHERE file_path = :file_path COLLATE NOCASE
        LIMIT 1
      `, { ":file_path": target.file.file_path })[0]?.values ?? [];

      const existingFilePath = rows.length > 0 ? String(rows[0][0]) : target.file.file_path;
      const existingKeywords = readUserMetadata(database, existingFilePath).keywords;
      const nextKeywords = applyKeywordBatchDelta(
        existingKeywords,
        normalizedInitialKeywords,
        normalizedTargetKeywords
      );

      const normalizedFile = { ...target.file, file_path: existingFilePath };
      upsertFileCatalogFromImageRecord(database, normalizedFile, indexedAt);
      updateUserKeywords(database, normalizedFile.file_path, nextKeywords, indexedAt);
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
  const directoryClause = directoryId ? "AND f.directory_id = :directory_id" : "";

  try {
    const row = database.exec(
      `
        SELECT
          COUNT(*),
          SUM(CASE WHEN ${catalogRecognizedClause} THEN 1 ELSE 0 END),
          SUM(CASE WHEN ${catalogUnrecognizedClause} THEN 1 ELSE 0 END)
        FROM files AS f
        LEFT JOIN images AS i
          ON i.file_path = f.file_path
         AND i."exists" = 1
        LEFT JOIN image_ai_metadata AS ai
          ON ai.image_id = i.id
        LEFT JOIN file_user_metadata AS user
          ON user.file_path = f.file_path
        WHERE f."exists" = 1
          ${directoryClause}
      `,
      directoryId ? { ":directory_id": directoryId } : undefined
    )[0]?.values[0] ?? [0, 0, 0];

    const visualRow = database.exec(`
      SELECT
        COUNT(*),
        SUM(CASE WHEN ${imageUnrecognizedClause} THEN 1 ELSE 0 END)
      FROM images AS i
      LEFT JOIN image_ai_metadata AS ai ON ai.image_id = i.id
      LEFT JOIN file_user_metadata AS user ON user.file_path = i.file_path
      WHERE i."exists" = 1
        ${directoryId ? "AND i.directory_id = :directory_id" : ""}
    `, directoryId ? { ":directory_id": directoryId } : undefined)[0]?.values[0] ?? [0, 0];

    return {
      totalFiles: Number(row[0] ?? 0),
      recognizedFiles: Number(row[1] ?? 0),
      unrecognizedFiles: Number(row[2] ?? 0),
      totalVisualImages: Number(visualRow[0] ?? 0),
      pendingVisualImages: Number(visualRow[1] ?? 0)
    };
  } finally {
    database.close();
  }
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
  knownCatalogFilePaths: string[];
  knownVisualFilePaths: string[];
  embeddedEvidenceByFilePath: Record<string, EmbeddedSearchEvidence[]>;
  visualPropertiesByFilePath: Record<string, VisualPropertyVector>;
  animationFactsByFilePath: Record<string, boolean>;
};

const parseEmbeddedEvidenceBlob = (value: unknown): EmbeddedSearchEvidence[] => {
  if (typeof value !== "string" || value === "") return [];
  return value.split("\u001f").flatMap((record) => {
    const separator = record.indexOf("\u001e");
    if (separator <= 0) return [];
    return [{
      kind: record.slice(0, separator) as EmbeddedSearchEvidence["kind"],
      searchText: record.slice(separator + 1)
    }];
  });
};

const catalogRecognizedClause = `(
  TRIM(COALESCE(ai.keywords, '')) <> ''
  OR TRIM(COALESCE(user.keywords, '')) <> ''
)`;
const catalogUnrecognizedClause = `NOT (${catalogRecognizedClause})`;
const imageUnrecognizedClause = catalogUnrecognizedClause;

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

const getNaturalConditionSql = (
  plannedTerm: PlannedSearchTerm,
  termIndex: number,
  params: Record<string, SqlValue>
): string[] => plannedTerm.conditions.map((condition, conditionIndex) => {
  const prefix = `catalog_term_${termIndex}_condition_${conditionIndex}`;
  if (condition.type === "fileKind") {
    const extensionKeys = getSearchableExtensionsForNaturalKind(condition.kind).map((extension, extensionIndex) => {
      const key = `:${prefix}_extension_${extensionIndex}`;
      params[key] = extension;
      return key;
    });
    return extensionKeys.length > 0 ? `f.extension IN (${extensionKeys.join(", ")})` : "1 = 0";
  }
  if (condition.type === "modifiedTime") {
    const startKey = `:${prefix}_start`;
    const endKey = `:${prefix}_end`;
    params[startKey] = new Date(condition.startMs).toISOString();
    params[endKey] = new Date(condition.endMs).toISOString();
    return `(f.modified_at >= ${startKey} AND f.modified_at < ${endKey})`;
  }
  if (condition.type === "animation") {
    return `(animation.status = 'indexed' AND animation.extractor_version = ${ANIMATION_FACT_EXTRACTOR_VERSION} AND animation.is_animated = 1)`;
  }
  if (condition.type === "visualProperty") {
    return getVisualPropertyConditionSql(condition);
  }
  if (condition.type === "orientation") {
    if (condition.orientation === "landscape") return "(i.image_width > 0 AND i.image_width > i.image_height)";
    if (condition.orientation === "portrait") return "(i.image_height > 0 AND i.image_height > i.image_width)";
    return "(i.image_width > 0 AND i.image_width = i.image_height)";
  }
  const widthKey = `:${prefix}_width`;
  const heightKey = `:${prefix}_height`;
  params[widthKey] = condition.width;
  params[heightKey] = condition.height;
  return `(i.image_width > 0 AND i.image_height > 0 AND i.image_width * ${heightKey} = i.image_height * ${widthKey})`;
});

const visualPropertyMetricColumn = (metric: VisualPropertyMetric) => {
  if (metric.startsWith("colorRatio.")) return `${metric.slice("colorRatio.".length)}_ratio`;
  if (metric.startsWith("colorBlockRatio.")) return `${metric.slice("colorBlockRatio.".length)}_block_ratio`;
  const scalarColumns: Record<Exclude<VisualPropertyMetric, `colorRatio.${string}` | `colorBlockRatio.${string}`>, string> = {
    transparentRatio: "transparent_ratio",
    borderTransparentRatio: "border_transparent_ratio",
    brightnessMean: "brightness_mean",
    brightnessMedian: "brightness_median",
    saturationMean: "saturation_mean",
    lowSaturationRatio: "low_saturation_ratio",
    borderWhiteRatio: "border_white_ratio",
    borderBlackRatio: "border_black_ratio",
    darkRatio: "dark_ratio"
  };
  return scalarColumns[metric as keyof typeof scalarColumns];
};

const getVisualPropertyConditionSql = (condition: VisualPropertySemanticCondition) => `(
  property.status = 'indexed'
  AND property.analyzer_version = ${VISUAL_PROPERTY_ANALYZER_VERSION}
  AND ${condition.constraints.map((constraint) => (
    `property.${visualPropertyMetricColumn(constraint.metric)} ${constraint.operator} ${constraint.value}`
  )).join(" AND ")}
)`;

export const searchIndexedCatalog = async (
  search: ImageSearchState,
  directories: PersistedDirectory[],
  queryPlan: SearchQueryPlan = planSearchQuery(search.query)
): Promise<IndexedCatalogSearchResponse> => {
  const database = await loadDatabase();
  const terms = queryPlan.terms.map((plannedTerm) => plannedTerm.term);
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
  params[":ai_query_model_id"] = search.aiQueryModelId ?? "";
  params[":ai_query_prompt_version"] = search.aiQueryPromptVersion ?? 0;
  queryPlan.terms.forEach((plannedTerm, termIndex) => {
    const { term } = plannedTerm;
    const fuzzyKey = `:catalog_term_${termIndex}`;
    const keywordKey = `:catalog_keyword_${termIndex}`;
    params[fuzzyKey] = escapeSqlLikeTerm(term);
    params[keywordKey] = term;
    const directoryKeys = [...(directoryTermMatches[termIndex] ?? [])].map((directoryId, directoryIndex) => {
      const key = `:catalog_term_${termIndex}_directory_${directoryIndex}`;
      params[key] = directoryId;
      return key;
    });
    const naturalConditionSql = getNaturalConditionSql(plannedTerm, termIndex, params);
    where.push(`(
      LOWER(f.file_name) LIKE ${fuzzyKey} ESCAPE '\\'
      OR LOWER(f.extension) LIKE ${fuzzyKey} ESCAPE '\\'
      OR LOWER(f.relative_directory) LIKE ${fuzzyKey} ESCAPE '\\'
      ${directoryKeys.length > 0 ? `OR f.directory_id IN (${directoryKeys.join(", ")})` : ""}
      OR LOWER(COALESCE(ai.caption, '')) LIKE ${fuzzyKey} ESCAPE '\\'
      OR INSTR(
        ',' || LOWER(REPLACE(COALESCE(ai.keywords, ''), '，', ',')) || ',',
        ',' || ${keywordKey} || ','
      ) > 0
      OR INSTR(
        ',' || LOWER(REPLACE(COALESCE(query_cache.keywords, ''), '，', ',')) || ',',
        ',' || ${keywordKey} || ','
      ) > 0
      OR EXISTS (
        SELECT 1
        FROM file_embedded_search_evidence AS embedded_match
        WHERE embedded_match.file_id = f.id
          AND LOWER(embedded_match.search_text) LIKE ${fuzzyKey} ESCAPE '\\'
      )
      OR LOWER(COALESCE(user.description, '')) LIKE ${fuzzyKey} ESCAPE '\\'
      OR INSTR(
        ',' || LOWER(REPLACE(COALESCE(user.keywords, ''), '，', ',')) || ',',
        ',' || ${keywordKey} || ','
      ) > 0
      ${naturalConditionSql.map((conditionSql) => `OR ${conditionSql}`).join("\n      ")}
    )`);
  });

  const sortColumn = search.sortField === "modified_at" ? "f.modified_at" : "f.file_name";
  const sortDirection = sortDirections[search.sortDirection] ?? sortDirections.asc;
  const embeddedEvidenceSelectSql = terms.length === 0 ? "NULL" : `(
    SELECT GROUP_CONCAT(
      embedded_result.evidence_kind || CHAR(30) || embedded_result.search_text,
      CHAR(31)
    )
    FROM (
      SELECT evidence_kind, search_text
      FROM file_embedded_search_evidence
      WHERE file_id = f.id
      ORDER BY evidence_kind
    ) AS embedded_result
  )`;
  const hasVisualPropertyConditions = queryPlan.terms.some((plannedTerm) => (
    plannedTerm.conditions.some((condition) => condition.type === "visualProperty")
  ));
  const visualPropertySelectSql = hasVisualPropertyConditions
    ? `property.status, property.analyzer_version, property.source_revision,
        ${visualPropertyDatabaseColumns.map((column) => `property.${column}`).join(", ")}`
    : "NULL, NULL, NULL";
  const visualPropertyJoinSql = hasVisualPropertyConditions
    ? "LEFT JOIN file_visual_properties AS property ON property.file_id = f.id"
    : "";
  const hasAnimationConditions = queryPlan.terms.some((plannedTerm) => plannedTerm.conditions.some((condition) => condition.type === "animation"));
  const animationSelectSql = hasAnimationConditions
    ? "animation.status, animation.extractor_version, animation.source_revision, animation.is_animated"
    : "NULL, NULL, NULL, NULL";
  const animationJoinSql = hasAnimationConditions
    ? "LEFT JOIN file_animation_facts AS animation ON animation.file_id = f.id"
    : "";

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
        ai.caption,
        ai.keywords,
        ai.ai_error,
        ai.indexed_at,
        user.description,
        user.keywords,
        ${embeddedEvidenceSelectSql},
        ${visualPropertySelectSql},
        ${animationSelectSql},
        query_cache.keywords,
        query_cache.source_revision,
        query_cache.model_id,
        query_cache.prompt_version
      FROM files AS f
      LEFT JOIN images AS i
        ON i.file_path = f.file_path
       AND i."exists" = 1
      LEFT JOIN image_ai_metadata AS ai
        ON ai.image_id = i.id
      LEFT JOIN file_user_metadata AS user
        ON user.file_path = f.file_path
      LEFT JOIN image_ai_query_cache AS query_cache
        ON query_cache.image_id = i.id
       AND query_cache.model_id = :ai_query_model_id
       AND query_cache.prompt_version = :ai_query_prompt_version
      ${visualPropertyJoinSql}
      ${animationJoinSql}
      WHERE ${where.join(" AND ")}
      ORDER BY ${sortColumn} ${sortDirection}, f.id ASC
    `, params)[0]?.values ?? [];

    const images: ImageSearchResult[] = [];
    const directoryIdByFilePath: Record<string, string> = {};
    const embeddedEvidenceByFilePath: Record<string, EmbeddedSearchEvidence[]> = {};
    const visualPropertiesByFilePath: Record<string, VisualPropertyVector> = {};
    const animationFactsByFilePath: Record<string, boolean> = {};
    for (const row of rows) {
      const filePath = String(row[1]);
      const fileName = String(row[2]);
      const extension = String(row[3]).toLowerCase();
      const capability = getFileFormatCapability(extension);
      if (!capability?.canSearch) continue;
      const isVisual = capability.canAIIndex;
      const canUseShellThumbnail = canUseSearchShellThumbnail(extension);
      const imageId = row[10] === null ? null : Number(row[10]);
      const aiError = imageId === null ? "" : String(row[15] ?? "");
      const failure = imageId === null
        ? { type: "pending" as const, label: t("recognition.pending") }
        : classifyRecognitionFailure(aiError);
      const animationOffset = 23 + (hasVisualPropertyConditions ? visualPropertyDatabaseColumns.length : 0);
      const queryCacheOffset = animationOffset + 4;
      const queryCacheValid = imageId !== null
        && String(row[queryCacheOffset + 1] ?? "") === createFileSourceRevision({
          fileSize: Number(row[4] ?? 0),
          modifiedAt: String(row[6] ?? "")
        })
        && String(row[queryCacheOffset + 2] ?? "") === (search.aiQueryModelId ?? "")
        && Number(row[queryCacheOffset + 3] ?? 0) === (search.aiQueryPromptVersion ?? 0);
      const aiKeywords = imageId === null ? [] : parseKeywordText(String(row[14] ?? ""));
      const cachedKeywords = queryCacheValid ? parseKeywordText(String(row[queryCacheOffset] ?? "")) : [];
      const combinedAiKeywords = [...new Map([...aiKeywords, ...cachedKeywords].map((keyword) => [keyword.toLocaleLowerCase(), keyword])).values()];
      images.push({
        id: imageId === null ? `file:${filePath}` : String(imageId),
        resultKind: isVisual ? "visual" : "file",
        filePath,
        fileName,
        extension,
        iconName: isVisual ? "skim-file" : capability.iconName,
        previewKind: capability.previewKind,
        canShellPreview: canUseShellThumbnail,
        fileSize: Number(row[4] ?? 0),
        createdAt: String(row[5] ?? ""),
        modifiedAt: String(row[6] ?? ""),
        imageWidth: imageId === null ? 0 : Number(row[11] ?? 0),
        imageHeight: imageId === null ? 0 : Number(row[12] ?? 0),
        caption: imageId === null ? "" : String(row[13] ?? ""),
        keywords: parseKeywordText(String(row[18] ?? "")),
        aiKeywords: combinedAiKeywords,
        userDescription: String(row[17] ?? ""),
        isRecognized: String(row[14] ?? "").trim() !== "" || String(row[18] ?? "").trim() !== "",
        aiError,
        failureType: failure.type,
        failureLabel: isVisual ? failure.label : "",
        indexedAt: imageId === null ? String(row[7] ?? "") : String(row[16] ?? row[7] ?? ""),
        thumbnailUrl: isVisual
          ? toThumbnailUrl(filePath)
          : canUseShellThumbnail
            ? toSearchShellThumbnailUrl(filePath)
            : "",
        searchEvidence: null
      });
      directoryIdByFilePath[filePath] = String(row[9]);
      const embeddedEvidence = parseEmbeddedEvidenceBlob(row[19]);
      if (embeddedEvidence.length > 0) embeddedEvidenceByFilePath[filePath] = embeddedEvidence;
      if (
        hasVisualPropertyConditions
        && String(row[20] ?? "") === "indexed"
        && Number(row[21]) === VISUAL_PROPERTY_ANALYZER_VERSION
        && String(row[22] ?? "") === createFileSourceRevision({
          fileSize: Number(row[4] ?? 0),
          modifiedAt: String(row[6] ?? "")
        })
      ) {
        visualPropertiesByFilePath[filePath] = inflateVisualPropertyValues(row, 23);
      }
      if (
        hasAnimationConditions
        && String(row[animationOffset] ?? "") === "indexed"
        && Number(row[animationOffset + 1]) === ANIMATION_FACT_EXTRACTOR_VERSION
        && String(row[animationOffset + 2] ?? "") === createFileSourceRevision({
          fileSize: Number(row[4] ?? 0),
          modifiedAt: String(row[6] ?? "")
        })
      ) animationFactsByFilePath[filePath] = Number(row[animationOffset + 3]) === 1;
    }

    const catalogStateParams: Record<string, SqlValue> = {};
    const catalogStateWhere = ['f."exists" = 1'];
    if (search.directoryId !== "all") {
      catalogStateWhere.push("f.directory_id = :catalog_state_directory_id");
      catalogStateParams[":catalog_state_directory_id"] = search.directoryId;
    }
    appendIncludedExtensionsFilter(
      catalogStateWhere,
      catalogStateParams,
      search.includedExtensions,
      "catalog_state_included_extension"
    );
    const catalogStateRows = database.exec(`
      SELECT f.file_path, f.extension, i.id, ai.keywords, user.keywords
      FROM files AS f
      LEFT JOIN images AS i
        ON i.file_path = f.file_path
       AND i."exists" = 1
      LEFT JOIN image_ai_metadata AS ai
        ON ai.image_id = i.id
      LEFT JOIN file_user_metadata AS user
        ON user.file_path = f.file_path
      WHERE ${catalogStateWhere.join(" AND ")}
    `, catalogStateParams)[0]?.values ?? [];
    const knownCatalogFilePaths: string[] = [];
    const knownVisualFilePaths: string[] = [];
    const availableFormats = new Set<string>();
    for (const row of catalogStateRows) {
      const filePath = String(row[0]);
      const extension = String(row[1]).toLowerCase();
      const capability = getFileFormatCapability(extension);
      if (!capability?.canSearch) continue;
      const imageId = row[2] === null ? null : Number(row[2]);
      knownCatalogFilePaths.push(filePath);
      if (capability.canAIIndex) {
        if (imageId !== null) knownVisualFilePaths.push(filePath);
      }
      const normalizedFormat = normalizeFileFormat(extension);
      availableFormats.add(normalizedFormat);
    }

    return {
      images,
      availableFormats: [...availableFormats].sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" })),
      directoryIdByFilePath,
      knownCatalogFilePaths,
      knownVisualFilePaths,
      embeddedEvidenceByFilePath,
      visualPropertiesByFilePath,
      animationFactsByFilePath
    };
  } finally {
    database.close();
  }
};

export const searchIndexedFiles = async (search: ImageSearchState): Promise<FileCatalogSearchResult[]> => {
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
  const where = ['i."exists" = 1'];

  if (search.directoryId !== "all") {
    where.push("i.directory_id = :directory_id");
    params[":directory_id"] = search.directoryId;
  }

  const fileFormat = normalizeFileFormat(search.fileFormat);
  appendFileFormatFilter(where, params, fileFormat);

  terms.forEach((term, index) => {
    const fuzzyKey = `:term_${index}`;
    const keywordKey = `:keyword_${index}`;
    where.push(`(
          LOWER(i.file_name) LIKE ${fuzzyKey}
          OR LOWER(COALESCE(ai.caption, '')) LIKE ${fuzzyKey}
          OR INSTR(
            ',' || LOWER(REPLACE(COALESCE(ai.keywords, ''), '，', ',')) || ',',
            ',' || ${keywordKey} || ','
          ) > 0
          OR LOWER(COALESCE(user.description, '')) LIKE ${fuzzyKey}
          OR INSTR(
            ',' || LOWER(REPLACE(COALESCE(user.keywords, ''), '，', ',')) || ',',
            ',' || ${keywordKey} || ','
          ) > 0
        )`);
    params[fuzzyKey] = `%${term}%`;
    params[keywordKey] = term;
  });

  const sortColumn = `i.${sortFieldColumns[search.sortField] ?? sortFieldColumns.file_name}`;
  const sortDirection = sortDirections[search.sortDirection] ?? sortDirections.asc;

  try {
    const result = database.exec(
      `
        SELECT
          i.id,
          i.file_path,
          i.file_name,
          i.file_size,
          i.created_at,
          i.modified_at,
          i.image_width,
          i.image_height,
          ai.caption,
          ai.keywords,
          ai.ai_error,
          ai.indexed_at,
          user.description,
          user.keywords
        FROM images AS i
        LEFT JOIN image_ai_metadata AS ai ON ai.image_id = i.id
        LEFT JOIN file_user_metadata AS user ON user.file_path = i.file_path
        WHERE ${where.join(" AND ")}
        ORDER BY ${sortColumn} ${sortDirection}, i.id ASC
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

      const aiKeywords = parseKeywordText(String(row[9] ?? ""));
      const keywords = parseKeywordText(String(row[13] ?? ""));
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
        canShellPreview: false,
        fileSize: Number(row[3] ?? 0),
        createdAt: String(row[4] ?? ""),
        modifiedAt: String(row[5] ?? ""),
        imageWidth: Number(row[6] ?? 0),
        imageHeight: Number(row[7] ?? 0),
        caption: String(row[8] ?? ""),
        keywords,
        aiKeywords,
        userDescription: String(row[12] ?? ""),
        isRecognized: aiKeywords.length > 0 || keywords.length > 0,
        aiError,
        failureType: failure.type,
        failureLabel: failure.label,
        indexedAt: String(row[11] ?? ""),
        thumbnailUrl: toThumbnailUrl(filePath),
        searchEvidence: null
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

    return {
      images
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
