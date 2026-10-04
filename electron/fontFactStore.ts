import type { Database } from "sql.js";
import type { FontFactResult } from "./fontFactTypes";

export const ensureFontFactSchema = (database: Database) => database.exec(`
  CREATE TABLE IF NOT EXISTS file_font_facts (
    file_id INTEGER PRIMARY KEY,
    source_revision TEXT NOT NULL,
    extractor_version INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('indexed', 'failed')),
    weight INTEGER NOT NULL DEFAULT 400,
    is_italic INTEGER NOT NULL DEFAULT 0,
    supports_latin INTEGER NOT NULL DEFAULT 0,
    supports_chinese INTEGER NOT NULL DEFAULT 0,
    is_variable INTEGER NOT NULL DEFAULT 0,
    error_code TEXT NOT NULL DEFAULT '',
    indexed_at TEXT NOT NULL,
    FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_file_font_facts_filter
    ON file_font_facts (extractor_version, status, weight, is_italic, is_variable);
`);

export const replaceFontFact = (database: Database, filePath: string, result: FontFactResult, indexedAt: string) => database.run(`
  INSERT INTO file_font_facts (
    file_id, source_revision, extractor_version, status, weight, is_italic,
    supports_latin, supports_chinese, is_variable, error_code, indexed_at
  )
  SELECT id, :source_revision, :extractor_version, :status, :weight, :is_italic,
         :supports_latin, :supports_chinese, :is_variable, :error_code, :indexed_at
  FROM files WHERE file_path = :file_path COLLATE NOCASE
  ON CONFLICT(file_id) DO UPDATE SET
    source_revision = excluded.source_revision,
    extractor_version = excluded.extractor_version,
    status = excluded.status,
    weight = excluded.weight,
    is_italic = excluded.is_italic,
    supports_latin = excluded.supports_latin,
    supports_chinese = excluded.supports_chinese,
    is_variable = excluded.is_variable,
    error_code = excluded.error_code,
    indexed_at = excluded.indexed_at
`, {
  ":file_path": filePath,
  ":source_revision": result.sourceRevision,
  ":extractor_version": result.extractorVersion,
  ":status": result.status,
  ":weight": result.status === "indexed" ? result.weight : 400,
  ":is_italic": result.status === "indexed" && result.italic ? 1 : 0,
  ":supports_latin": result.status === "indexed" && result.supportsLatin ? 1 : 0,
  ":supports_chinese": result.status === "indexed" && result.supportsChinese ? 1 : 0,
  ":is_variable": result.status === "indexed" && result.variable ? 1 : 0,
  ":error_code": result.errorCode,
  ":indexed_at": indexedAt
});
