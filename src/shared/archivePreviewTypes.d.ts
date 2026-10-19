export interface ArchivePreviewEntry {
  path: string;
  size: number | null;
  compressedSize: number | null;
  directory: boolean;
}

export interface ArchivePreviewData {
  entries: ArchivePreviewEntry[];
  entryCount: number;
  totalUncompressedSize: number;
  truncated: boolean;
}

export type ArchivePreviewFallbackReason =
  | "passwordRequired"
  | "invalidArchive"
  | "unsupportedArchive"
  | "tooLarge"
  | "timedOut"
  | "failed";

export interface ArchiveWorkerRequest {
  sourcePath: string;
  maximumOutputBytes: number;
}

export interface ArchiveWorkerResponse {
  exitCode: number;
  output: string;
  outputTruncated: boolean;
}
