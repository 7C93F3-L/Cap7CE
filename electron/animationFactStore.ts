import type { Database } from "sql.js";
import type { AnimationFactResult } from "./animationFactTypes";

export const ensureAnimationFactSchema = (database: Database) => database.exec(`
  CREATE TABLE IF NOT EXISTS file_animation_facts (
    file_id INTEGER PRIMARY KEY,
    source_revision TEXT NOT NULL,
    extractor_version INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('indexed', 'failed')),
    is_animated INTEGER NOT NULL DEFAULT 0 CHECK (is_animated IN (0, 1)),
    error_code TEXT NOT NULL DEFAULT '',
    indexed_at TEXT NOT NULL,
    FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_file_animation_facts_version
    ON file_animation_facts (extractor_version, status, is_animated);
`);

export const replaceAnimationFact = (database: Database, filePath: string, result: AnimationFactResult, indexedAt: string) => {
  database.run(`
    INSERT INTO file_animation_facts (file_id, source_revision, extractor_version, status, is_animated, error_code, indexed_at)
    SELECT id, :source_revision, :extractor_version, :status, :is_animated, :error_code, :indexed_at
    FROM files WHERE file_path = :file_path COLLATE NOCASE
    ON CONFLICT(file_id) DO UPDATE SET
      source_revision = excluded.source_revision,
      extractor_version = excluded.extractor_version,
      status = excluded.status,
      is_animated = excluded.is_animated,
      error_code = excluded.error_code,
      indexed_at = excluded.indexed_at
  `, {
    ":file_path": filePath,
    ":source_revision": result.sourceRevision,
    ":extractor_version": result.extractorVersion,
    ":status": result.status,
    ":is_animated": result.status === "indexed" && result.isAnimated ? 1 : 0,
    ":error_code": result.errorCode,
    ":indexed_at": indexedAt
  });
};
