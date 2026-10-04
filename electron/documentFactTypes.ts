export const DOCUMENT_FACT_EXTRACTOR_VERSION = 2;

export const supportedDocumentFactExtensions = [".pdf", ".docx", ".pptx", ".xlsx", ".ai", ".cdr", ".psd"] as const;
export type DocumentContentCountKind = "pages" | "slides" | "sheets";

export interface DocumentFactCandidate { filePath: string; sourceRevision: string }
export interface DocumentFactResult {
  sourceRevision: string;
  extractorVersion: number;
  status: "indexed" | "failed";
  contentCount: number;
  countKind: DocumentContentCountKind;
  imageCompositionKnown: boolean;
  hasEmbeddedImages: boolean;
  artboardCountKnown: boolean;
  artboardCount: number;
  errorCode: string;
}
export interface DocumentFactWriteRecord { filePath: string; result: DocumentFactResult }
