import type { Database } from "sql.js";
import { searchArchiveContentTypes } from "./archiveSearchFilters";
import type { ArchiveFactResult } from "./archiveFactTypes";

const contentColumn = (value: (typeof searchArchiveContentTypes)[number]) => `has_${value === "threeD" ? "three_d" : value}`;

export const ensureArchiveFactSchema = (database: Database) => database.exec(`
  CREATE TABLE IF NOT EXISTS file_archive_facts (
    file_id INTEGER PRIMARY KEY,
    source_revision TEXT NOT NULL,
    extractor_version INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('indexed', 'failed')),
    listing_complete INTEGER NOT NULL DEFAULT 0,
    file_count_known INTEGER NOT NULL DEFAULT 0,
    file_count INTEGER NOT NULL DEFAULT 0,
    structure_known INTEGER NOT NULL DEFAULT 0,
    has_directories INTEGER NOT NULL DEFAULT 0,
    has_image INTEGER NOT NULL DEFAULT 0,
    has_video INTEGER NOT NULL DEFAULT 0,
    has_audio INTEGER NOT NULL DEFAULT 0,
    has_document INTEGER NOT NULL DEFAULT 0,
    has_project INTEGER NOT NULL DEFAULT 0,
    has_three_d INTEGER NOT NULL DEFAULT 0,
    has_program INTEGER NOT NULL DEFAULT 0,
    has_other INTEGER NOT NULL DEFAULT 0,
    error_code TEXT NOT NULL DEFAULT '',
    indexed_at TEXT NOT NULL,
    FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_file_archive_facts_filter
    ON file_archive_facts (extractor_version, status, file_count, has_directories);
`);

export const replaceArchiveFact = (database: Database, filePath: string, result: ArchiveFactResult, indexedAt: string) => {
  const contentTypes = new Set(result.status === "indexed" ? result.contentTypes : []);
  const contentColumns = searchArchiveContentTypes.map(contentColumn);
  database.run(`
    INSERT INTO file_archive_facts (
      file_id, source_revision, extractor_version, status, listing_complete, file_count_known, file_count,
      structure_known, has_directories, ${contentColumns.join(", ")}, error_code, indexed_at
    )
    SELECT id, :source_revision, :extractor_version, :status, :listing_complete, :file_count_known, :file_count,
           :structure_known, :has_directories, ${contentColumns.map((column) => `:${column}`).join(", ")}, :error_code, :indexed_at
    FROM files WHERE file_path = :file_path COLLATE NOCASE
    ON CONFLICT(file_id) DO UPDATE SET
      source_revision = excluded.source_revision,
      extractor_version = excluded.extractor_version,
      status = excluded.status,
      listing_complete = excluded.listing_complete,
      file_count_known = excluded.file_count_known,
      file_count = excluded.file_count,
      structure_known = excluded.structure_known,
      has_directories = excluded.has_directories,
      ${contentColumns.map((column) => `${column} = excluded.${column}`).join(",\n      ")},
      error_code = excluded.error_code,
      indexed_at = excluded.indexed_at
  `, {
    ":file_path": filePath,
    ":source_revision": result.sourceRevision,
    ":extractor_version": result.extractorVersion,
    ":status": result.status,
    ":listing_complete": result.status === "indexed" && result.listingComplete ? 1 : 0,
    ":file_count_known": result.status === "indexed" && result.fileCountKnown ? 1 : 0,
    ":file_count": result.status === "indexed" ? result.fileCount : 0,
    ":structure_known": result.status === "indexed" && result.structureKnown ? 1 : 0,
    ":has_directories": result.status === "indexed" && result.hasDirectories ? 1 : 0,
    ...Object.fromEntries(searchArchiveContentTypes.map((value) => [`:${contentColumn(value)}`, contentTypes.has(value) ? 1 : 0])),
    ":error_code": result.errorCode,
    ":indexed_at": indexedAt
  });
};
