import type { EmbeddedSearchEvidenceKind } from "../src/shared/embeddedMetadataTypes";
export type * from "../src/shared/embeddedMetadataTypes";
export const EMBEDDED_METADATA_EXTRACTOR_VERSION = 1;
export const embeddedSearchEvidenceKinds: readonly EmbeddedSearchEvidenceKind[] = [
  "visual_content",
  "embedded_title",
  "embedded_subject",
  "embedded_description",
  "embedded_keywords",
  "software_family",
  "capture_device",
  "media_title",
  "media_artist",
  "media_album",
  "font_family",
  "font_style"
] as const;
