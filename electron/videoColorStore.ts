import type { Database } from "sql.js";
import {
  flattenVisualProperties,
  inflateVisualPropertyValues,
  normalizeVisualPropertyErrorCode,
  visualPropertyDatabaseColumns,
  visualPropertyRatioColumnSql
} from "./visualPropertyStore";
import type { StoredVisualPropertyRecord, VisualPropertyIndexRecord } from "./visualPropertyTypes";
import { VIDEO_COLOR_REPRESENTATIVE_VERSION } from "./videoColorTypes";

export interface StoredVideoColorRecord extends StoredVisualPropertyRecord {
  representativeVersion: number;
}

export const ensureVideoColorSchema = (database: Database) => database.exec(`
  CREATE TABLE IF NOT EXISTS file_video_color_facts (
    file_id INTEGER PRIMARY KEY,
    source_revision TEXT NOT NULL,
    analyzer_version INTEGER NOT NULL,
    representative_version INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('indexed', 'failed')),
    error_code TEXT NOT NULL DEFAULT '',
    indexed_at TEXT NOT NULL,
    ${visualPropertyRatioColumnSql},
    FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_file_video_color_facts_version
    ON file_video_color_facts (representative_version, analyzer_version, status);
`);

export const readVideoColorRecord = (database: Database, filePath: string): StoredVideoColorRecord | null => {
  const row = database.exec(`
    SELECT fact.source_revision, fact.analyzer_version, fact.representative_version,
           fact.status, fact.error_code, fact.indexed_at,
           ${visualPropertyDatabaseColumns.map((column) => `fact.${column}`).join(", ")}
    FROM file_video_color_facts AS fact
    INNER JOIN files AS file ON file.id = fact.file_id
    WHERE file.file_path = :file_path COLLATE NOCASE
    LIMIT 1
  `, { ":file_path": filePath })[0]?.values[0];
  if (!row) return null;
  const status = String(row[3]) as StoredVisualPropertyRecord["status"];
  return {
    sourceRevision: String(row[0]),
    analyzerVersion: Number(row[1]),
    representativeVersion: Number(row[2]),
    status,
    errorCode: String(row[4] ?? ""),
    indexedAt: String(row[5]),
    properties: status === "indexed" ? inflateVisualPropertyValues(row, 6) : null
  };
};

export const replaceVideoColorRecord = (
  database: Database,
  filePath: string,
  record: VisualPropertyIndexRecord,
  indexedAt: string
) => {
  if (record.status === "indexed" && !record.properties) {
    throw new Error("Indexed video colors require a property vector.");
  }
  const values = record.status === "indexed" && record.properties
    ? flattenVisualProperties(record.properties)
    : null;
  const columns = visualPropertyDatabaseColumns.join(", ");
  const parameters = visualPropertyDatabaseColumns.map((column) => `:${column}`).join(", ");
  const updates = visualPropertyDatabaseColumns.map((column) => `${column} = excluded.${column}`).join(", ");
  database.run(`
    INSERT INTO file_video_color_facts (
      file_id, source_revision, analyzer_version, representative_version,
      status, error_code, indexed_at, ${columns}
    )
    SELECT id, :source_revision, :analyzer_version, :representative_version,
           :status, :error_code, :indexed_at, ${parameters}
    FROM files WHERE file_path = :file_path COLLATE NOCASE
    ON CONFLICT(file_id) DO UPDATE SET
      source_revision = excluded.source_revision,
      analyzer_version = excluded.analyzer_version,
      representative_version = excluded.representative_version,
      status = excluded.status,
      error_code = excluded.error_code,
      indexed_at = excluded.indexed_at,
      ${updates}
  `, {
    ":file_path": filePath,
    ":source_revision": record.sourceRevision,
    ":analyzer_version": record.analyzerVersion,
    ":representative_version": VIDEO_COLOR_REPRESENTATIVE_VERSION,
    ":status": record.status,
    ":error_code": record.status === "failed" ? normalizeVisualPropertyErrorCode(record.errorCode) || "unknown" : "",
    ":indexed_at": indexedAt,
    ...Object.fromEntries(visualPropertyDatabaseColumns.map((column) => [`:${column}`, values?.[column] ?? null]))
  });
};
