export type EmbeddedSearchEvidenceKind =
  | "visual_content"
  | "embedded_title"
  | "embedded_subject"
  | "embedded_description"
  | "embedded_keywords"
  | "software_family"
  | "capture_device"
  | "media_title"
  | "media_artist"
  | "media_album"
  | "font_family"
  | "font_style";
export type EmbeddedMetadataStatus = "indexed" | "empty" | "failed";

export interface EmbeddedSearchEvidence {
  kind: EmbeddedSearchEvidenceKind;
  searchText: string;
}

export interface EmbeddedMetadataExtraction {
  sourceRevision: string;
  extractorVersion: number;
  status: EmbeddedMetadataStatus;
  evidence: EmbeddedSearchEvidence[];
  capturedAt: string | null;
  errorCode: string;
}

export interface RawEmbeddedMetadata {
  visualDescriptions?: unknown[];
  titles?: unknown[];
  subjects?: unknown[];
  descriptions?: unknown[];
  keywords?: unknown[];
  software?: unknown[];
  cameraMake?: unknown;
  cameraModel?: unknown;
  capturedAt?: unknown;
  mediaTitle?: unknown;
  mediaArtist?: unknown;
  mediaAlbum?: unknown;
  fontFamily?: unknown;
  fontStyle?: unknown;
}

export type PreviewEmbeddedMetadataKind = EmbeddedSearchEvidenceKind;
export interface PreviewEmbeddedMetadata {
  items: Array<{ kind: PreviewEmbeddedMetadataKind; text: string }>;
  capturedAt: string | null;
}
export interface CancellablePreviewMetadataRead {
  result: Promise<PreviewEmbeddedMetadata | null>;
  cancel: () => void;
}
