import type { PreviewEmbeddedMetadata } from "./embeddedMetadataTypes";
export interface StoredMetadataSource { fileSize: number; modifiedAt: string; }
export interface StoredMetadataResult { metadata: PreviewEmbeddedMetadata | null; isCurrent: boolean; }
export interface LegacyKeywordEntry { path: string; keywords: string[]; createdFileTimeMilliseconds: string; }
export interface LegacyKeywordPage { entries: LegacyKeywordEntry[]; after: string | null; }
export type StoredIndexRequest = { kind: "metadata"; path: string; source: StoredMetadataSource }
  | { kind: "counts"; ids: string[] } | { kind: "keywords"; after: string };
