export const IMAGE_DIMENSION_EXTRACTOR_VERSION = 1;

export const supportedImageDimensionExtensions = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".tif",
  ".tiff",
  ".gif",
  ".svg",
  ".bmp"
] as const;

export interface ImageDimensionCandidate {
  filePath: string;
  sourceRevision: string;
}

export interface ImageDimensionResult {
  sourceRevision: string;
  extractorVersion: number;
  status: "indexed" | "failed";
  width: number;
  height: number;
  errorCode: string;
}

export interface ImageDimensionWriteRecord {
  filePath: string;
  result: ImageDimensionResult;
}
