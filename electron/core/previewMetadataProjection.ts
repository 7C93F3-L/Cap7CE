import { embeddedSearchEvidenceKinds } from "../embeddedMetadataTypes";
import type { EmbeddedMetadataExtraction, PreviewEmbeddedMetadata } from "../../src/shared/embeddedMetadataTypes";

export const toPreviewMetadata = (extraction: EmbeddedMetadataExtraction): PreviewEmbeddedMetadata | null => {
  if (extraction.status !== "indexed") return null;
  const items = extraction.evidence.map(item => ({ kind: item.kind, text: item.searchText }));
  return items.length || extraction.capturedAt ? { items, capturedAt: extraction.capturedAt } : null;
};

export const validPreviewMetadata = (value: unknown): value is PreviewEmbeddedMetadata | null => {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Object.keys(value).sort().join(",") !== "capturedAt,items") return false;
  const metadata = value as PreviewEmbeddedMetadata;
  return (metadata.capturedAt === null || typeof metadata.capturedAt === "string" && metadata.capturedAt.length <= 64)
    && Array.isArray(metadata.items) && metadata.items.length <= embeddedSearchEvidenceKinds.length
    && Array.from(metadata.items).every(item => item && Object.keys(item).sort().join(",") === "kind,text"
      && embeddedSearchEvidenceKinds.includes(item.kind) && typeof item.text === "string" && item.text.length <= 64 * 1024);
};
