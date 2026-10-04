import type { Database } from "sql.js";
import type { VideoFactResult } from "./videoFactTypes";

export const ensureVideoFactSchema = (database: Database) => database.exec(`
  CREATE TABLE IF NOT EXISTS file_video_facts (
    file_id INTEGER PRIMARY KEY,
    source_revision TEXT NOT NULL,
    extractor_version INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('indexed', 'failed')),
    duration_ms INTEGER NOT NULL DEFAULT 0,
    width INTEGER NOT NULL DEFAULT 0,
    height INTEGER NOT NULL DEFAULT 0,
    error_code TEXT NOT NULL DEFAULT '',
    indexed_at TEXT NOT NULL,
    FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_file_video_facts_dimensions
    ON file_video_facts (extractor_version, status, width, height, duration_ms);
`);

export const replaceVideoFact = (database: Database, filePath: string, result: VideoFactResult, indexedAt: string) => {
  database.run(`
    INSERT INTO file_video_facts (file_id, source_revision, extractor_version, status, duration_ms, width, height, error_code, indexed_at)
    SELECT id, :source_revision, :extractor_version, :status, :duration_ms, :width, :height, :error_code, :indexed_at
    FROM files WHERE file_path = :file_path COLLATE NOCASE
    ON CONFLICT(file_id) DO UPDATE SET
      source_revision = excluded.source_revision,
      extractor_version = excluded.extractor_version,
      status = excluded.status,
      duration_ms = excluded.duration_ms,
      width = excluded.width,
      height = excluded.height,
      error_code = excluded.error_code,
      indexed_at = excluded.indexed_at
  `, {
    ":file_path": filePath,
    ":source_revision": result.sourceRevision,
    ":extractor_version": result.extractorVersion,
    ":status": result.status,
    ":duration_ms": result.status === "indexed" ? result.durationMs : 0,
    ":width": result.status === "indexed" ? result.width : 0,
    ":height": result.status === "indexed" ? result.height : 0,
    ":error_code": result.errorCode,
    ":indexed_at": indexedAt
  });
};
