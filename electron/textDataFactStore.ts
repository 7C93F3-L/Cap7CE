import type { Database } from "sql.js";
import type { TextDataFactResult } from "./textDataFactTypes";

export const ensureTextDataFactSchema = (database: Database) => database.exec(`
  CREATE TABLE IF NOT EXISTS file_text_data_facts (
    file_id INTEGER PRIMARY KEY,
    source_revision TEXT NOT NULL,
    extractor_version INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('indexed', 'failed')),
    fact_kind TEXT NOT NULL CHECK (fact_kind IN ('text', 'csv', 'json')),
    character_count INTEGER NOT NULL DEFAULT 0,
    line_count INTEGER NOT NULL DEFAULT 0,
    record_count INTEGER NOT NULL DEFAULT 0,
    column_count INTEGER NOT NULL DEFAULT 0,
    json_root_kind TEXT NOT NULL DEFAULT 'none' CHECK (json_root_kind IN ('none', 'array', 'object')),
    error_code TEXT NOT NULL DEFAULT '',
    indexed_at TEXT NOT NULL,
    FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_file_text_data_facts_filter
    ON file_text_data_facts (extractor_version, status, fact_kind, character_count, line_count, record_count, column_count, json_root_kind);
`);

export const replaceTextDataFact = (database: Database, filePath: string, result: TextDataFactResult, indexedAt: string) => {
  database.run(`
    INSERT INTO file_text_data_facts (
      file_id, source_revision, extractor_version, status, fact_kind, character_count, line_count,
      record_count, column_count, json_root_kind, error_code, indexed_at
    )
    SELECT id, :source_revision, :extractor_version, :status, :fact_kind, :character_count, :line_count,
      :record_count, :column_count, :json_root_kind, :error_code, :indexed_at
    FROM files WHERE file_path = :file_path COLLATE NOCASE
    ON CONFLICT(file_id) DO UPDATE SET
      source_revision = excluded.source_revision,
      extractor_version = excluded.extractor_version,
      status = excluded.status,
      fact_kind = excluded.fact_kind,
      character_count = excluded.character_count,
      line_count = excluded.line_count,
      record_count = excluded.record_count,
      column_count = excluded.column_count,
      json_root_kind = excluded.json_root_kind,
      error_code = excluded.error_code,
      indexed_at = excluded.indexed_at
  `, {
    ":file_path": filePath,
    ":source_revision": result.sourceRevision,
    ":extractor_version": result.extractorVersion,
    ":status": result.status,
    ":fact_kind": result.factKind,
    ":character_count": result.status === "indexed" ? result.characterCount : 0,
    ":line_count": result.status === "indexed" ? result.lineCount : 0,
    ":record_count": result.status === "indexed" ? result.recordCount : 0,
    ":column_count": result.status === "indexed" ? result.columnCount : 0,
    ":json_root_kind": result.status === "indexed" ? result.jsonRootKind : "none",
    ":error_code": result.errorCode,
    ":indexed_at": indexedAt
  });
};
