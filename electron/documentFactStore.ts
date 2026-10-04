import type { Database } from "sql.js";
import type { DocumentFactResult } from "./documentFactTypes";

export const ensureDocumentFactSchema = (database: Database) => database.exec(`
  CREATE TABLE IF NOT EXISTS file_document_facts (
    file_id INTEGER PRIMARY KEY,
    source_revision TEXT NOT NULL,
    extractor_version INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('indexed', 'failed')),
    content_count INTEGER NOT NULL DEFAULT 0,
    count_kind TEXT NOT NULL DEFAULT 'pages' CHECK (count_kind IN ('pages', 'slides', 'sheets')),
    error_code TEXT NOT NULL DEFAULT '',
    indexed_at TEXT NOT NULL,
    FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_file_document_facts_filter
    ON file_document_facts (extractor_version, status, content_count);
`);

export const replaceDocumentFact = (database: Database, filePath: string, result: DocumentFactResult, indexedAt: string) => {
  database.run(`
    INSERT INTO file_document_facts (file_id, source_revision, extractor_version, status, content_count, count_kind, error_code, indexed_at)
    SELECT id, :source_revision, :extractor_version, :status, :content_count, :count_kind, :error_code, :indexed_at
    FROM files WHERE file_path = :file_path COLLATE NOCASE
    ON CONFLICT(file_id) DO UPDATE SET
      source_revision = excluded.source_revision,
      extractor_version = excluded.extractor_version,
      status = excluded.status,
      content_count = excluded.content_count,
      count_kind = excluded.count_kind,
      error_code = excluded.error_code,
      indexed_at = excluded.indexed_at
  `, {
    ":file_path": filePath,
    ":source_revision": result.sourceRevision,
    ":extractor_version": result.extractorVersion,
    ":status": result.status,
    ":content_count": result.status === "indexed" ? result.contentCount : 0,
    ":count_kind": result.countKind,
    ":error_code": result.errorCode,
    ":indexed_at": indexedAt
  });
};
