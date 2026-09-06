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

export const ensureIndexMetadataSchema = (database: Database) => {
  createMetadataTables(database);
  database.run("PRAGMA foreign_keys = ON");
  ensureEmbeddedMetadataSchema(database);
  ensureVisualPropertySchema(database);
  ensureAnimationFactSchema(database);
  ensureAiQueryEvidenceSchema(database);
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
