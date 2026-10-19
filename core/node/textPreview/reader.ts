import fs from "node:fs/promises";
import path from "node:path";
import WordExtractor from "word-extractor";
import { skimTextPreviewExtensions, maximumSkimTextPreviewBytes, maximumWordPreviewBytes, wordPreviewExtensions } from "../../../electron/textPreviewPolicy";
import type { SkimTextPreview as SkimTextPreviewResult } from "../../../src/shared/textPreviewTypes";
const wordExtractor = new WordExtractor();
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
