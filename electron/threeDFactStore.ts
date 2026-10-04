import type { Database } from "sql.js";
import type { ThreeDFactResult } from "./threeDFactTypes";

export const ensureThreeDFactSchema = (database: Database) => database.exec(`
  CREATE TABLE IF NOT EXISTS file_three_d_facts (
    file_id INTEGER PRIMARY KEY,
    source_revision TEXT NOT NULL,
    extractor_version INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('indexed', 'failed')),
    triangle_count_known INTEGER NOT NULL DEFAULT 0,
    triangle_count INTEGER NOT NULL DEFAULT 0,
    animation_known INTEGER NOT NULL DEFAULT 0,
    has_animation INTEGER NOT NULL DEFAULT 0,
    rig_known INTEGER NOT NULL DEFAULT 0,
    has_rig INTEGER NOT NULL DEFAULT 0,
    error_code TEXT NOT NULL DEFAULT '',
    indexed_at TEXT NOT NULL,
    FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_file_three_d_facts_filter
    ON file_three_d_facts (extractor_version, status, triangle_count, has_animation, has_rig);
`);

export const replaceThreeDFact = (database: Database, filePath: string, result: ThreeDFactResult, indexedAt: string) => {
  database.run(`
    INSERT INTO file_three_d_facts (
      file_id, source_revision, extractor_version, status, triangle_count_known, triangle_count,
      animation_known, has_animation, rig_known, has_rig, error_code, indexed_at
    )
    SELECT id, :source_revision, :extractor_version, :status, :triangle_count_known, :triangle_count,
           :animation_known, :has_animation, :rig_known, :has_rig, :error_code, :indexed_at
    FROM files WHERE file_path = :file_path COLLATE NOCASE
    ON CONFLICT(file_id) DO UPDATE SET
      source_revision = excluded.source_revision,
      extractor_version = excluded.extractor_version,
      status = excluded.status,
      triangle_count_known = excluded.triangle_count_known,
      triangle_count = excluded.triangle_count,
      animation_known = excluded.animation_known,
      has_animation = excluded.has_animation,
      rig_known = excluded.rig_known,
      has_rig = excluded.has_rig,
      error_code = excluded.error_code,
      indexed_at = excluded.indexed_at
  `, {
    ":file_path": filePath,
    ":source_revision": result.sourceRevision,
    ":extractor_version": result.extractorVersion,
    ":status": result.status,
    ":triangle_count_known": result.status === "indexed" && result.triangleCountKnown ? 1 : 0,
    ":triangle_count": result.status === "indexed" && result.triangleCountKnown ? result.triangleCount : 0,
    ":animation_known": result.status === "indexed" && result.animationKnown ? 1 : 0,
    ":has_animation": result.status === "indexed" && result.animationKnown && result.hasAnimation ? 1 : 0,
    ":rig_known": result.status === "indexed" && result.rigKnown ? 1 : 0,
    ":has_rig": result.status === "indexed" && result.rigKnown && result.hasRig ? 1 : 0,
    ":error_code": result.errorCode,
    ":indexed_at": indexedAt
  });
};
