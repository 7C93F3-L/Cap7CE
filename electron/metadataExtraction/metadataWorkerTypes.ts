// Physical source identity and source versions remain owned by the Core broker.
export type MetadataWorkerKind = "image-dimensions" | "video" | "audio" | "font" | "model" | "document" | "three-d" | "text-data" | "archive";
export type MetadataFontProperties = Pick<import("../../core/node/fileFacts/domain/fontFactTypes").FontFactResult,
  "weight" | "italic" | "supportsLatin" | "supportsChinese" | "variable">;
export type MetadataModelProperties = Pick<import("../../core/node/fileFacts/domain/modelFactTypes").ModelFactResult, "parameterCount" | "precision">;
export type MetadataDocumentProperties = { contentCount?: number; countKind?: import("../documentFactTypes").DocumentContentCountKind;
  hasEmbeddedImages?: boolean; artboardCount?: number };
export type MetadataThreeDProperties = { triangleCount?: number; hasAnimation?: boolean; hasRig?: boolean };
export type MetadataTextDataProperties =
  | { factKind: "text"; characterCount: number; lineCount: number }
  | { factKind: "csv"; recordCount: number; columnCount: number }
  | { factKind: "json"; recordCount: number; jsonRootKind: "array" | "object" };
export interface MetadataWorkerTask { kind: MetadataWorkerKind; filePath: string }
export interface MetadataWorkerResult {
  state: "indexed" | "unsupported" | "failed";
  width?: number;
  height?: number;
  durationMilliseconds?: number;
  channelCount?: number;
  fontProperties?: MetadataFontProperties;
  modelProperties?: MetadataModelProperties;
  documentProperties?: MetadataDocumentProperties;
  threeDProperties?: MetadataThreeDProperties;
  textDataProperties?: MetadataTextDataProperties;
  archiveProperties?: import("./archiveMetadataReader").ArchiveMetadataProperties;
  errorCode?: string;
  isAnimated?: boolean | null;
  visualProperties?: import("./imageMetadataMetrics").ImageMetadataProperties | null;
}
export interface MetadataWorkerResponse {
  id: number;
  result: MetadataWorkerResult;
  residentBytes: number;
}
