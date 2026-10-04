import type { Database } from "sql.js";
import type { ModelFactResult } from "./modelFactTypes";

export const ensureModelFactSchema = (database: Database) => database.exec(`
  CREATE TABLE IF NOT EXISTS file_model_facts (
    file_id INTEGER PRIMARY KEY,
    source_revision TEXT NOT NULL,
    extractor_version INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('indexed', 'failed')),
    parameter_count INTEGER NOT NULL DEFAULT 0,
    precision TEXT NOT NULL DEFAULT '',
    error_code TEXT NOT NULL DEFAULT '',
    indexed_at TEXT NOT NULL,
    FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_file_model_facts_filter
    ON file_model_facts (extractor_version, status, parameter_count, precision);
`);

export const replaceModelFact = (database: Database, filePath: string, result: ModelFactResult, indexedAt: string) => database.run(`
  INSERT INTO file_model_facts (
    file_id, source_revision, extractor_version, status, parameter_count, precision, error_code, indexed_at
  )
  SELECT id, :source_revision, :extractor_version, :status, :parameter_count, :precision, :error_code, :indexed_at
  FROM files WHERE file_path = :file_path COLLATE NOCASE
  ON CONFLICT(file_id) DO UPDATE SET
    source_revision = excluded.source_revision,
    extractor_version = excluded.extractor_version,
    status = excluded.status,
    parameter_count = excluded.parameter_count,
    precision = excluded.precision,
    error_code = excluded.error_code,
    indexed_at = excluded.indexed_at
`, {
  ":file_path": filePath,
  ":source_revision": result.sourceRevision,
  ":extractor_version": result.extractorVersion,
  ":status": result.status,
  ":parameter_count": result.status === "indexed" ? result.parameterCount : 0,
  ":precision": result.status === "indexed" ? result.precision : "",
  ":error_code": result.errorCode,
  ":indexed_at": indexedAt
});
