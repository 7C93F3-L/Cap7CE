import type { Database } from "sql.js";
import type { DocumentFactResult } from "./documentFactTypes";

export const ensureDocumentFactSchema = (database: Database) => {
  database.exec(`CREATE TABLE IF NOT EXISTS file_document_facts (
    file_id INTEGER PRIMARY KEY,
    source_revision TEXT NOT NULL,
    extractor_version INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('indexed', 'failed')),
    content_count INTEGER NOT NULL DEFAULT 0,
    count_kind TEXT NOT NULL DEFAULT 'pages' CHECK (count_kind IN ('pages', 'slides', 'sheets')),
    image_composition_known INTEGER NOT NULL DEFAULT 0 CHECK (image_composition_known IN (0, 1)),
    has_embedded_images INTEGER NOT NULL DEFAULT 0 CHECK (has_embedded_images IN (0, 1)),
    artboard_count_known INTEGER NOT NULL DEFAULT 0 CHECK (artboard_count_known IN (0, 1)),
    artboard_count INTEGER NOT NULL DEFAULT 0,
    error_code TEXT NOT NULL DEFAULT '',
    indexed_at TEXT NOT NULL,
    FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_file_document_facts_filter
    ON file_document_facts (extractor_version, status, content_count);
  `);
  const columns = database.exec("PRAGMA table_info(file_document_facts)")[0]?.values ?? [];
  if (!columns.some((row) => String(row[1]) === "has_embedded_images")) {
    database.exec("ALTER TABLE file_document_facts ADD COLUMN has_embedded_images INTEGER NOT NULL DEFAULT 0 CHECK (has_embedded_images IN (0, 1))");
  }
  if (!columns.some((row) => String(row[1]) === "image_composition_known")) {
    database.exec("ALTER TABLE file_document_facts ADD COLUMN image_composition_known INTEGER NOT NULL DEFAULT 0 CHECK (image_composition_known IN (0, 1))");
  }
  if (!columns.some((row) => String(row[1]) === "artboard_count_known")) {
    database.exec("ALTER TABLE file_document_facts ADD COLUMN artboard_count_known INTEGER NOT NULL DEFAULT 0 CHECK (artboard_count_known IN (0, 1))");
  }
  if (!columns.some((row) => String(row[1]) === "artboard_count")) {
    database.exec("ALTER TABLE file_document_facts ADD COLUMN artboard_count INTEGER NOT NULL DEFAULT 0");
  }
  database.exec(`CREATE INDEX IF NOT EXISTS idx_file_document_facts_images_v2
    ON file_document_facts (extractor_version, status, image_composition_known, has_embedded_images);`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_file_document_facts_artboards_v1
    ON file_document_facts (extractor_version, status, artboard_count_known, artboard_count);`);
};

export const replaceDocumentFact = (database: Database, filePath: string, result: DocumentFactResult, indexedAt: string) => {
  database.run(`
    INSERT INTO file_document_facts (file_id, source_revision, extractor_version, status, content_count, count_kind, image_composition_known, has_embedded_images, artboard_count_known, artboard_count, error_code, indexed_at)
    SELECT id, :source_revision, :extractor_version, :status, :content_count, :count_kind, :image_composition_known, :has_embedded_images, :artboard_count_known, :artboard_count, :error_code, :indexed_at
    FROM files WHERE file_path = :file_path COLLATE NOCASE
    ON CONFLICT(file_id) DO UPDATE SET
      source_revision = excluded.source_revision,
      extractor_version = excluded.extractor_version,
      status = excluded.status,
      content_count = excluded.content_count,
      count_kind = excluded.count_kind,
      image_composition_known = excluded.image_composition_known,
      has_embedded_images = excluded.has_embedded_images,
      artboard_count_known = excluded.artboard_count_known,
      artboard_count = excluded.artboard_count,
      error_code = excluded.error_code,
      indexed_at = excluded.indexed_at
  `, {
    ":file_path": filePath,
    ":source_revision": result.sourceRevision,
    ":extractor_version": result.extractorVersion,
    ":status": result.status,
    ":content_count": result.status === "indexed" ? result.contentCount : 0,
    ":count_kind": result.countKind,
    ":image_composition_known": result.status === "indexed" && result.imageCompositionKnown ? 1 : 0,
    ":has_embedded_images": result.status === "indexed" && result.hasEmbeddedImages ? 1 : 0,
    ":artboard_count_known": result.status === "indexed" && result.artboardCountKnown ? 1 : 0,
    ":artboard_count": result.status === "indexed" && result.artboardCountKnown ? result.artboardCount : 0,
    ":error_code": result.errorCode,
    ":indexed_at": indexedAt
  });
};
