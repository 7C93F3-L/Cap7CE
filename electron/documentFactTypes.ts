export const DOCUMENT_FACT_EXTRACTOR_VERSION = 1;

export const supportedDocumentFactExtensions = [".pdf", ".docx", ".pptx", ".xlsx"] as const;
export type DocumentContentCountKind = "pages" | "slides" | "sheets";

export interface DocumentFactCandidate { filePath: string; sourceRevision: string }
export interface DocumentFactResult {
  sourceRevision: string;
  extractorVersion: number;
  status: "indexed" | "failed";
  contentCount: number;
  countKind: DocumentContentCountKind;
  errorCode: string;
}
export interface DocumentFactWriteRecord { filePath: string; result: DocumentFactResult }
