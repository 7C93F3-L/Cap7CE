import { CoreTextPreviewClient } from "./core/coreTextPreviewClient";
export { skimTextPreviewExtensions, maximumSkimTextPreviewBytes } from "./textPreviewPolicy";
export type { SkimTextPreview as SkimTextPreviewResult } from "../src/shared/textPreviewTypes";
const text = new CoreTextPreviewClient();
export const readSkimTextPreview = (filePath: string) => text.read(filePath);
export const closeSkimTextPreview = () => text.cancelAll();
export const skimAudioPreviewExtensions = new Set([".flac", ".m4a", ".mp3", ".ogg", ".wav"]);
export const skimVideoPreviewExtensions = new Set([".mkv", ".mp4", ".mov", ".webm"]);

export interface SkimMediaByteRange {
  start: number;
  end: number;
  status: 200 | 206;
}

export const getSkimMediaMimeType = (extension: string) => ({
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".mkv": "video/x-matroska",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm"
} as Record<string, string>)[extension.toLowerCase()] ?? null;

export const parseSkimMediaByteRange = (fileSize: number, rangeHeader: string | null): SkimMediaByteRange | null => {
  if (!Number.isSafeInteger(fileSize) || fileSize < 0) return null;
  if (!rangeHeader) return { start: 0, end: Math.max(0, fileSize - 1), status: 200 };
  if (fileSize === 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) return null;
  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : fileSize - 1;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= fileSize) {
    return null;
  }
  return { start, end: Math.min(end, fileSize - 1), status: 206 };
};
