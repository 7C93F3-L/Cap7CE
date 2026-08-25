import type { Database } from "sql.js";
import {
  embeddedSearchEvidenceKinds,
  type EmbeddedMetadataExtraction,
  type EmbeddedSearchEvidenceKind
} from "./embeddedMetadataTypes";

export interface StoredEmbeddedMetadataState {
  sourceRevision: string;
  extractorVersion: number;
  status: EmbeddedMetadataExtraction["status"];
  capturedAt: string | null;
  errorCode: string;
  indexedAt: string;
}

const validEvidenceKinds = new Set<string>(embeddedSearchEvidenceKinds);
const normalizeErrorCode = (value: string) => {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return normalized.slice(0, 64);
};

export const ensureEmbeddedMetadataSchema = (database: Database) => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS file_embedded_metadata_state (
      file_id INTEGER PRIMARY KEY,
      source_revision TEXT NOT NULL,
      extractor_version INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('indexed', 'empty', 'failed')),
      captured_at TEXT,
      error_code TEXT NOT NULL DEFAULT '',
      indexed_at TEXT NOT NULL,
      FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS file_embedded_search_evidence (
      file_id INTEGER NOT NULL,
      evidence_kind TEXT NOT NULL,
      search_text TEXT NOT NULL,
      PRIMARY KEY (file_id, evidence_kind),
      FOREIGN KEY (file_id) REFERENCES file_embedded_metadata_state (file_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_file_embedded_metadata_state_version
      ON file_embedded_metadata_state (extractor_version, status);
  `);
};

export const readEmbeddedMetadataState = (
  database: Database,
  filePath: string
): StoredEmbeddedMetadataState | null => {
  const row = database.exec(`
    SELECT state.source_revision, state.extractor_version, state.status,
           state.captured_at, state.error_code, state.indexed_at
    FROM file_embedded_metadata_state AS state
    INNER JOIN files AS file ON file.id = state.file_id
    WHERE file.file_path = :file_path COLLATE NOCASE
    LIMIT 1
  `, { ":file_path": filePath })[0]?.values[0];
  if (!row) return null;
  return {
    sourceRevision: String(row[0]),
    extractorVersion: Number(row[1]),
    status: String(row[2]) as StoredEmbeddedMetadataState["status"],
    capturedAt: row[3] === null ? null : String(row[3]),
    errorCode: String(row[4] ?? ""),
    indexedAt: String(row[5])
  };
};

export const readEmbeddedSearchEvidence = (
  database: Database,
  filePath: string
) => (database.exec(`
  SELECT evidence_kind, search_text
  FROM file_embedded_search_evidence AS evidence
  INNER JOIN files AS file ON file.id = evidence.file_id
  WHERE file.file_path = :file_path COLLATE NOCASE
  ORDER BY evidence_kind
`, { ":file_path": filePath })[0]?.values ?? []).map((row) => ({
  kind: String(row[0]) as EmbeddedSearchEvidenceKind,
  searchText: String(row[1])
}));

export const replaceEmbeddedMetadata = (
  database: Database,
  filePath: string,
  extraction: EmbeddedMetadataExtraction,
  indexedAt: string
) => {
  const fileId = Number(database.exec(`
    SELECT id FROM files WHERE file_path = :file_path COLLATE NOCASE LIMIT 1
  `, { ":file_path": filePath })[0]?.values[0]?.[0]);
  if (!Number.isSafeInteger(fileId) || fileId <= 0) {
    throw new Error("Embedded metadata requires an indexed file.");
  }
  const evidence = extraction.evidence.filter((item) => (
    validEvidenceKinds.has(item.kind) && item.searchText.trim() !== ""
  ));
  const status = extraction.status === "failed"
    ? "failed"
    : evidence.length > 0 || extraction.capturedAt
      ? "indexed"
      : "empty";

  database.run("SAVEPOINT replace_embedded_metadata");
  try {
    database.run(`
      INSERT INTO file_embedded_metadata_state (
        file_id, source_revision, extractor_version, status, captured_at, error_code, indexed_at
      ) VALUES (
        :file_id, :source_revision, :extractor_version, :status, :captured_at, :error_code, :indexed_at
      )
      ON CONFLICT(file_id) DO UPDATE SET
        source_revision = excluded.source_revision,
        extractor_version = excluded.extractor_version,
        status = excluded.status,
        captured_at = excluded.captured_at,
        error_code = excluded.error_code,
        indexed_at = excluded.indexed_at
    `, {
      ":file_id": fileId,
      ":source_revision": extraction.sourceRevision,
      ":extractor_version": extraction.extractorVersion,
      ":status": status,
      ":captured_at": extraction.capturedAt,
      ":error_code": status === "failed" ? normalizeErrorCode(extraction.errorCode) || "unknown" : "",
      ":indexed_at": indexedAt
    });

    database.run(
      "DELETE FROM file_embedded_search_evidence WHERE file_id = :file_id",
      { ":file_id": fileId }
    );
    if (status === "indexed") {
      const statement = database.prepare(`
        INSERT INTO file_embedded_search_evidence (file_id, evidence_kind, search_text)
        VALUES (:file_id, :evidence_kind, :search_text)
      `);
      try {
        for (const item of evidence) {
          statement.run({
            ":file_id": fileId,
            ":evidence_kind": item.kind,
            ":search_text": item.searchText.slice(0, 64 * 1024)
          });
          statement.reset();
        }
      } finally {
        statement.free();
      }
    }
    database.run("RELEASE SAVEPOINT replace_embedded_metadata");
  } catch (error) {
    try {
      database.run("ROLLBACK TO SAVEPOINT replace_embedded_metadata");
      database.run("RELEASE SAVEPOINT replace_embedded_metadata");
    } catch {
      // Preserve the original write error.
    }
    throw error;
  }
};
