import type { PreviewWindowData, PreviewEmbeddedMetadata, SkimPreviewInfo } from "./types";

export type FileInformationData = Pick<PreviewWindowData, "sessionId" | "fileName" | "filePath" | "modifiedAt" | "info" | "imageWidth" | "imageHeight" | "manualKeywords" | "userDescription" | "searchEvidence" | "skimActive" | "embeddedMetadata"> & { fileSize: number | null };
export interface CatalogFileDetails {
  info: SkimPreviewInfo;
  imageWidth?: number;
  imageHeight?: number;
  embeddedMetadata?: PreviewEmbeddedMetadata;
}
export interface CatalogFileDetailsRequest { taskId: string; authorizationId: string; requestId: string; }
