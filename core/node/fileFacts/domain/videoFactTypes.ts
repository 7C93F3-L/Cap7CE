export const VIDEO_FACT_EXTRACTOR_VERSION = 2;

export const supportedVideoFactExtensions = [
  ".avi", ".m4v", ".mkv", ".mov", ".mp4", ".webm",
  ".wmv", ".mpg", ".mpeg", ".mts", ".m2ts", ".mxf", ".flv", ".rmvb", ".3gp"
] as const;

export interface VideoFactCandidate { filePath: string; sourceRevision: string }
export interface VideoFactResult {
  sourceRevision: string;
  extractorVersion: number;
  status: "indexed" | "failed";
  durationMs: number;
  width: number;
  height: number;
  errorCode: string;
}
export interface VideoFactWriteRecord { filePath: string; result: VideoFactResult }
