import type { Database } from "sql.js";
import { formatKeywordText, parseKeywordText } from "./keywordRules";
import { ensureEmbeddedMetadataSchema } from "./embeddedMetadataStore";
import { ensureVisualPropertySchema } from "./visualPropertyStore";
import { ensureAnimationFactSchema } from "./animationFactStore";
import { ensureAiQueryEvidenceSchema } from "./aiQueryEvidenceStore";

export interface StoredUserMetadata {
  description: string;
  keywords: string[];
  updatedAt: string;
}

export interface StoredAiMetadata {
  caption: string;
  keywords: string[];
  indexedAt: string;
  error: string;
  failedAt: string | null;
}

const tableHasColumn = (database: Database, tableName: string, columnName: string) => (
  (database.exec(`PRAGMA table_info(${tableName})`)[0]?.values ?? [])
    .some((column) => String(column[1]) === columnName)
);

const createMetadataTables = (database: Database) => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS file_user_metadata (
      file_path TEXT PRIMARY KEY,
      description TEXT NOT NULL DEFAULT '',
      keywords TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (file_path) REFERENCES files (file_path) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS image_ai_metadata (
      image_id INTEGER PRIMARY KEY,
      caption TEXT NOT NULL DEFAULT '',
      keywords TEXT NOT NULL DEFAULT '',
      indexed_at TEXT NOT NULL,
      ai_error TEXT NOT NULL DEFAULT '',
      ai_failed_at TEXT,
      FOREIGN KEY (image_id) REFERENCES images (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_file_user_metadata_keywords
      ON file_user_metadata (keywords);

    CREATE INDEX IF NOT EXISTS idx_image_ai_metadata_keywords
      ON image_ai_metadata (keywords);
  `);
};

const migrateLegacyMetadataTables = (database: Database) => {
  const hasLegacyImageMetadata = tableHasColumn(database, "images", "manual_index");
  const hasLegacyFileMetadata = tableHasColumn(database, "files", "user_keywords");
  if (!hasLegacyImageMetadata && !hasLegacyFileMetadata) {
    createMetadataTables(database);
    return false;
  }

  database.run("BEGIN TRANSACTION");
  try {
    database.exec(`
      CREATE TEMP TABLE legacy_file_user_metadata (
        file_path TEXT PRIMARY KEY,
        description TEXT NOT NULL DEFAULT '',
        keywords TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );

      CREATE TEMP TABLE legacy_image_ai_metadata (
        image_id INTEGER PRIMARY KEY,
        caption TEXT NOT NULL DEFAULT '',
        keywords TEXT NOT NULL DEFAULT '',
        indexed_at TEXT NOT NULL,
        ai_error TEXT NOT NULL DEFAULT '',
        ai_failed_at TEXT
      );
    `);

    if (hasLegacyImageMetadata) {
      database.exec(`
        INSERT INTO legacy_file_user_metadata (file_path, description, keywords, updated_at)
        SELECT file_path, caption, keywords, indexed_at
        FROM images
        WHERE manual_index = 1
          AND (TRIM(caption) <> '' OR TRIM(keywords) <> '');

        INSERT INTO legacy_image_ai_metadata (
          image_id, caption, keywords, indexed_at, ai_error, ai_failed_at
        )
        SELECT id, caption, keywords, indexed_at, ai_error, ai_failed_at
        FROM images
        WHERE manual_index = 0;
      `);
    }

    if (hasLegacyFileMetadata) {
      database.exec(`
        INSERT INTO legacy_file_user_metadata (file_path, description, keywords, updated_at)
        SELECT file_path, '', user_keywords, COALESCE(user_keywords_at, indexed_at)
        FROM files
        WHERE TRIM(user_keywords) <> ''
        ON CONFLICT(file_path) DO UPDATE SET
          keywords = CASE
            WHEN TRIM(legacy_file_user_metadata.keywords) = '' THEN excluded.keywords
            WHEN TRIM(excluded.keywords) = '' THEN legacy_file_user_metadata.keywords
            ELSE legacy_file_user_metadata.keywords || ',' || excluded.keywords
          END,
          updated_at = CASE
            WHEN excluded.updated_at > legacy_file_user_metadata.updated_at THEN excluded.updated_at
            ELSE legacy_file_user_metadata.updated_at
          END;
      `);
    }

    database.exec(`
      DROP TABLE IF EXISTS file_user_metadata;
      DROP TABLE IF EXISTS image_ai_metadata;

      CREATE TABLE images_v2 (
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

      INSERT INTO images_v2 (
        id, file_path, file_name, file_size, created_at, modified_at,
        image_width, image_height, indexed_at, directory_id, "exists"
      )
      SELECT
        id, file_path, file_name, file_size, created_at, modified_at,
        image_width, image_height, indexed_at, directory_id, "exists"
      FROM images;

      CREATE TABLE files_v2 (
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

      INSERT INTO files_v2 (
        id, file_path, file_name, extension, relative_directory, path_evidence_version,
        file_size, created_at, modified_at, indexed_at, directory_id, "exists"
      )
      SELECT
        id, file_path, file_name, extension, relative_directory, path_evidence_version,
        file_size, created_at, modified_at, indexed_at, directory_id, "exists"
      FROM files;

      DROP TABLE images;
      DROP TABLE files;
      ALTER TABLE images_v2 RENAME TO images;
      ALTER TABLE files_v2 RENAME TO files;

      CREATE INDEX idx_images_directory_exists ON images (directory_id, "exists");
      CREATE INDEX idx_images_file_name ON images (file_name);
      CREATE INDEX idx_files_directory_exists ON files (directory_id, "exists");
      CREATE INDEX idx_files_file_name ON files (file_name);
      CREATE INDEX idx_files_extension ON files (extension);
    `);

    createMetadataTables(database);

    database.exec(`
      INSERT INTO file_user_metadata (file_path, description, keywords, updated_at)
      SELECT legacy.file_path, legacy.description, legacy.keywords, legacy.updated_at
      FROM legacy_file_user_metadata AS legacy
      INNER JOIN files AS file ON file.file_path = legacy.file_path;

      INSERT INTO image_ai_metadata (
        image_id, caption, keywords, indexed_at, ai_error, ai_failed_at
      )
      SELECT legacy.image_id, legacy.caption, legacy.keywords,
             legacy.indexed_at, legacy.ai_error, legacy.ai_failed_at
      FROM legacy_image_ai_metadata AS legacy
      INNER JOIN images AS image ON image.id = legacy.image_id;

      DROP TABLE legacy_file_user_metadata;
      DROP TABLE legacy_image_ai_metadata;
    `);
    database.run("COMMIT");
    return true;
  } catch (error) {
    try {
      database.run("ROLLBACK");
    } catch {
      // Preserve the original migration error.
    }
    throw error;
  }
};

export const ensureIndexMetadataSchema = (database: Database) => {
  const migrated = migrateLegacyMetadataTables(database);
  database.run("PRAGMA foreign_keys = ON");
  ensureEmbeddedMetadataSchema(database);
  ensureVisualPropertySchema(database);
  ensureAnimationFactSchema(database);
  ensureAiQueryEvidenceSchema(database);
  return migrated;
};

export const readUserMetadata = (database: Database, filePath: string): StoredUserMetadata => {
  const row = database.exec(`
    SELECT description, keywords, updated_at
    FROM file_user_metadata
    WHERE file_path = :file_path COLLATE NOCASE
    LIMIT 1
  `, { ":file_path": filePath })[0]?.values[0];
  return {
    description: String(row?.[0] ?? ""),
    keywords: parseKeywordText(String(row?.[1] ?? "")),
    updatedAt: String(row?.[2] ?? "")
  };
};

export const upsertUserMetadata = (
  database: Database,
  filePath: string,
  description: string,
  keywords: string[],
  updatedAt: string
) => {
  database.run(`
    INSERT INTO file_user_metadata (file_path, description, keywords, updated_at)
    VALUES (:file_path, :description, :keywords, :updated_at)
    ON CONFLICT(file_path) DO UPDATE SET
      description = excluded.description,
      keywords = excluded.keywords,
      updated_at = excluded.updated_at
  `, {
    ":file_path": filePath,
    ":description": description.trim(),
    ":keywords": formatKeywordText(keywords),
    ":updated_at": updatedAt
  });
};

export const updateUserKeywords = (
  database: Database,
  filePath: string,
  keywords: string[],
  updatedAt: string
) => {
  const existing = readUserMetadata(database, filePath);
  upsertUserMetadata(database, filePath, existing.description, keywords, updatedAt);
};

export const upsertAiRecognition = (
  database: Database,
  imageId: number,
  caption: string,
  keywords: string[],
  indexedAt: string
) => {
  database.run(`
    INSERT INTO image_ai_metadata (
      image_id, caption, keywords, indexed_at, ai_error, ai_failed_at
    ) VALUES (
      :image_id, :caption, :keywords, :indexed_at, '', NULL
    )
    ON CONFLICT(image_id) DO UPDATE SET
      caption = excluded.caption,
      keywords = excluded.keywords,
      indexed_at = excluded.indexed_at,
      ai_error = '',
      ai_failed_at = NULL
  `, {
    ":image_id": imageId,
    ":caption": caption.trim(),
    ":keywords": formatKeywordText(keywords),
    ":indexed_at": indexedAt
  });
};

export const upsertAiRecognitionFailure = (
  database: Database,
  imageId: number,
  message: string,
  indexedAt: string
) => {
  database.run(`
    INSERT INTO image_ai_metadata (
      image_id, caption, keywords, indexed_at, ai_error, ai_failed_at
    ) VALUES (
      :image_id, '', '', :indexed_at, :ai_error, :ai_failed_at
    )
    ON CONFLICT(image_id) DO UPDATE SET
      caption = '',
      keywords = '',
      indexed_at = excluded.indexed_at,
      ai_error = excluded.ai_error,
      ai_failed_at = excluded.ai_failed_at
  `, {
    ":image_id": imageId,
    ":indexed_at": indexedAt,
    ":ai_error": message.slice(0, 500),
    ":ai_failed_at": indexedAt
  });
};
