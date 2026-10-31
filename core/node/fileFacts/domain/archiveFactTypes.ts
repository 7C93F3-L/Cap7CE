import type { SearchArchiveContentType } from "../../resourceCatalog/domain/formats/archiveSearchFilters";

export const ARCHIVE_FACT_EXTRACTOR_VERSION = 2;
export const supportedArchiveFactExtensions = [".7z", ".rar", ".zip"] as const;

export interface ArchiveFactCandidate { filePath: string; sourceRevision: string }
export interface ArchiveFactResult {
  sourceRevision: string;
  extractorVersion: number;
  status: "indexed" | "failed";
  listingComplete: boolean;
  fileCountKnown: boolean;
  fileCount: number;
  structureKnown: boolean;
  hasDirectories: boolean;
  contentTypes: SearchArchiveContentType[];
  errorCode: string;
}
export interface ArchiveFactWriteRecord { filePath: string; result: ArchiveFactResult }
