import fs from "node:fs/promises";
import path from "node:path";
import WordExtractor from "word-extractor";

export const skimTextPreviewExtensions = new Set([
  ".txt", ".md", ".ini", ".html", ".csv", ".json", ".xml", ".yaml", ".yml", ".doc", ".docx"
]);
export const skimAudioPreviewExtensions = new Set([".m4a", ".mp3", ".wav"]);
export const skimVideoPreviewExtensions = new Set([".mp4", ".mov", ".webm"]);
export const maximumSkimTextPreviewBytes = 1024 * 1024;
const maximumWordPreviewBytes = 64 * 1024 * 1024;
const wordPreviewExtensions = new Set([".doc", ".docx"]);
const wordExtractor = new WordExtractor();

export interface SkimMediaByteRange {
  start: number;
  end: number;
  status: 200 | 206;
}

export const getSkimMediaMimeType = (extension: string) => ({
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
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

export interface SkimTextPreviewResult {
  content: string;
  encoding: "utf-8" | "utf-16le" | "utf-16be";
  truncated: boolean;
}

const unsupportedTextError = () => Object.assign(
  new Error("Text preview encoding is unsupported."),
  { code: "EUNSUPPORTED_ENCODING" }
);

const decodeUtf8 = (buffer: Buffer, truncated: boolean) => {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const attempts = truncated ? 4 : 1;
  for (let trim = 0; trim < attempts; trim += 1) {
    try {
      return decoder.decode(buffer.subarray(0, buffer.length - trim));
    } catch {
      // A truncated preview may end in the middle of a UTF-8 sequence.
    }
  }
  throw unsupportedTextError();
};

const decodeUtf16Be = (buffer: Buffer) => {
  const evenLength = buffer.length - (buffer.length % 2);
  const swapped = Buffer.allocUnsafe(evenLength);
  for (let index = 0; index < evenLength; index += 2) {
    swapped[index] = buffer[index + 1];
    swapped[index + 1] = buffer[index];
  }
  return new TextDecoder("utf-16le", { fatal: true }).decode(swapped);
};

const readWordTextPreview = async (filePath: string, fileSize: number): Promise<SkimTextPreviewResult> => {
  if (fileSize > maximumWordPreviewBytes) {
    throw unsupportedTextError();
  }
  const document = await wordExtractor.extract(filePath);
  const encoded = Buffer.from(document.getBody(), "utf8");
  const truncated = encoded.length > maximumSkimTextPreviewBytes;
  return {
    content: decodeUtf8(encoded.subarray(0, maximumSkimTextPreviewBytes), truncated),
    encoding: "utf-8",
    truncated
  };
};

export const readSkimTextPreview = async (filePath: string): Promise<SkimTextPreviewResult> => {
  if (!path.isAbsolute(filePath) || !skimTextPreviewExtensions.has(path.extname(filePath).toLowerCase())) {
    throw unsupportedTextError();
  }
  const normalizedPath = path.normalize(path.resolve(filePath));
  const stat = await fs.stat(normalizedPath);
  if (!stat.isFile()) throw unsupportedTextError();
  if (wordPreviewExtensions.has(path.extname(normalizedPath).toLowerCase())) {
    return readWordTextPreview(normalizedPath, stat.size);
  }

  const truncated = stat.size > maximumSkimTextPreviewBytes;
  const readLength = Math.min(stat.size, maximumSkimTextPreviewBytes);
  const handle = await fs.open(normalizedPath, "r");
  let buffer: Buffer;
  try {
    buffer = Buffer.alloc(readLength);
    const { bytesRead } = await handle.read(buffer, 0, readLength, 0);
    buffer = buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }

  if (buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    return { content: decodeUtf8(buffer.subarray(3), truncated), encoding: "utf-8", truncated };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    const contentBuffer = buffer.subarray(2, buffer.length - ((buffer.length - 2) % 2));
    return {
      content: new TextDecoder("utf-16le", { fatal: true }).decode(contentBuffer),
      encoding: "utf-16le",
      truncated
    };
  }
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    return { content: decodeUtf16Be(buffer.subarray(2)), encoding: "utf-16be", truncated };
  }
  if (buffer.includes(0)) throw unsupportedTextError();
  return { content: decodeUtf8(buffer, truncated), encoding: "utf-8", truncated };
};
