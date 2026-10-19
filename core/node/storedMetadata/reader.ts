import { DatabaseSync } from "node:sqlite";
import { lstatSync } from "node:fs";
import path from "node:path";
import { createFileSourceRevision } from "../../../electron/fileSourceRevision";
import { EMBEDDED_METADATA_EXTRACTOR_VERSION } from "../../../electron/embeddedMetadataTypes";
import { parseKeywordText } from "../../../electron/keywordRules";
import { emptyStoredMetadata, validStoredMetadata, validLegacyKeywordPage } from "../../../electron/core/storedMetadataProjection";
import type { StoredIndexRequest, StoredMetadataResult } from "../../../src/shared/storedMetadataTypes";
const requireTables = (db: DatabaseSync, names: string[]) => {
  for (const name of names) {
    const row = db.prepare("SELECT type, sql FROM sqlite_master WHERE name=?").get(name);
    if (row?.type !== "table" || typeof row.sql !== "string" || /^CREATE\s+VIRTUAL/i.test(row.sql)) throw Error("legacy-index-schema-unavailable");
  }
};
// Compatibility only: fixed historical path, native read-only pages, no schema setup or source-file access.
export function readStoredIndex(root: string, request: StoredIndexRequest): unknown {
  const fallback = request.kind === "metadata" ? emptyStoredMetadata : request.kind === "counts" ? Object.fromEntries(request.ids.map(id => [id, 0])) : { entries: [], after: null };
  const file = path.join(root, "index", "cap7ce-index.db");
  try { if (!lstatSync(file).isFile()) throw Error("legacy-index-unavailable"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw error; }
  const db = new DatabaseSync(file, { readOnly: true, allowExtension: false });
  try {
    db.exec("PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=1000; BEGIN");
    if (request.kind === "counts") {
      requireTables(db, ["images"]); const count = db.prepare('SELECT COUNT(*) AS count FROM images WHERE directory_id=? AND "exists"=1');
      return Object.fromEntries(request.ids.map(id => [id, Number(count.get(id)?.count ?? 0)]));
    }
    if (request.kind === "keywords") {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='file_user_metadata'").get()) return fallback;
      requireTables(db, ["files", "file_user_metadata"]);
      const rows = db.prepare(`SELECT substr(u.file_path,1,32768) AS file_path, substr(u.keywords,1,524289) AS keywords, substr(f.created_at,1,65) AS created_at FROM file_user_metadata u
        JOIN files f ON f.file_path=u.file_path WHERE u.file_path > ? COLLATE NOCASE AND u.keywords<>'' ORDER BY u.file_path COLLATE NOCASE LIMIT 64`).all(request.after);
      const page = { entries: rows.flatMap(row => { const created = Date.parse(String(row.created_at));
        if (String(row.keywords).length > 524288) throw Error("legacy-keywords-entry-too-large");
        return Number.isFinite(created) ? [{ path: String(row.file_path), keywords: parseKeywordText(String(row.keywords)), createdFileTimeMilliseconds: String(Math.trunc(created + 11644473600000)) }] : []; }),
        after: rows.length === 64 ? String(rows[rows.length - 1].file_path) : null };
      if (!validLegacyKeywordPage(page)) throw Error("legacy-keywords-invalid-result"); return page;
    }
    requireTables(db, ["files", "file_embedded_metadata_state", "file_embedded_search_evidence"]);
    const state = db.prepare(`SELECT substr(state.source_revision,1,256) AS source_revision, state.extractor_version, state.status, substr(state.captured_at,1,65) AS captured_at
      FROM file_embedded_metadata_state state JOIN files file ON file.id=state.file_id WHERE file.file_path=? COLLATE NOCASE LIMIT 1`).get(request.path);
    const isCurrent = state?.source_revision === createFileSourceRevision(request.source) && state.extractor_version === EMBEDDED_METADATA_EXTRACTOR_VERSION;
    if (!isCurrent || state.status !== "indexed") return { metadata: null, isCurrent };
    const rows = db.prepare(`SELECT evidence_kind, substr(search_text,1,65537) AS search_text FROM file_embedded_search_evidence evidence
      JOIN files file ON file.id=evidence.file_id WHERE file.file_path=? COLLATE NOCASE ORDER BY evidence_kind LIMIT 13`).all(request.path);
    const result = { isCurrent, metadata: rows.length || state.captured_at ? { items: rows.map(row => ({ kind: String(row.evidence_kind), text: String(row.search_text) })), capturedAt: state.captured_at ?? null } : null };
    return validStoredMetadata(result) ? result as StoredMetadataResult : emptyStoredMetadata;
  } finally { db.close(); }
}
