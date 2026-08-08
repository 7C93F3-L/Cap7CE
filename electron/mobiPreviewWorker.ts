import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parentPort, workerData } from "node:worker_threads";
import { parse } from "parse5";
import sharp from "sharp";
import type {
  MobiPreviewChapter,
  MobiPreviewFallbackReason,
  MobiWorkerResponse
} from "./mobiPreviewTypes";

const MAX_RECORD_COUNT = 4_096;
const MAX_RECORD_SIZE = 8 * 1024 * 1024;
const MAX_DECLARED_TEXT_SIZE = 8 * 1024 * 1024;
const MAX_TEXT_LENGTH = 4 * 1024 * 1024;
const MAX_COVER_SIZE = 16 * 1024 * 1024;

type MobiParserModule = typeof import("@lingo-reader/mobi-parser");
const importEsm = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<MobiParserModule>;

const loadMobiParser = async () => {
  // The package's CommonJS export is published as .js inside a type=module package.
  // Resolve the Node entry, then explicitly load its working ESM sibling.
  const commonJsEntry = require.resolve("@lingo-reader/mobi-parser");
  const esmEntry = commonJsEntry.replace(/\.js$/u, ".mjs");
  return importEsm(pathToFileURL(esmEntry).href);
};

class MobiWorkerError extends Error {
  constructor(readonly reason: MobiPreviewFallbackReason, message: string) {
    super(message);
  }
}

interface HtmlNode {
  nodeName?: string;
  tagName?: string;
  value?: string;
  childNodes?: HtmlNode[];
}

const readUInt16 = (bytes: Buffer, offset: number) => bytes.readUInt16BE(offset);
const readUInt32 = (bytes: Buffer, offset: number) => bytes.readUInt32BE(offset);
const readAscii = (bytes: Buffer, offset: number, length: number) => (
  bytes.subarray(offset, offset + length).toString("ascii")
);

const validateMobiHeader = (source: Buffer) => {
  if (source.length < 86) throw new MobiWorkerError("invalidMobi", "PalmDB header is truncated.");
  if (readAscii(source, 60, 8) !== "BOOKMOBI") {
    throw new MobiWorkerError("invalidMobi", "PalmDB type and creator are not BOOKMOBI.");
  }

  const recordCount = readUInt16(source, 76);
  const recordTableEnd = 78 + recordCount * 8;
  if (
    recordCount < 2
    || recordCount > MAX_RECORD_COUNT
    || recordTableEnd > source.length
  ) {
    throw new MobiWorkerError("invalidMobi", "PalmDB record table is invalid.");
  }

  const recordOffsets: number[] = [];
  let previousOffset = recordTableEnd;
  for (let index = 0; index < recordCount; index += 1) {
    const offset = readUInt32(source, 78 + index * 8);
    if (offset < previousOffset || offset >= source.length) {
      throw new MobiWorkerError("invalidMobi", "PalmDB record offset is invalid or truncated.");
    }
    recordOffsets.push(offset);
    previousOffset = offset;
  }
  for (let index = 0; index < recordOffsets.length; index += 1) {
    const end = recordOffsets[index + 1] ?? source.length;
    if (end - recordOffsets[index] > MAX_RECORD_SIZE) {
      throw new MobiWorkerError("tooLarge", "A MOBI record exceeds the preview limit.");
    }
  }

  const record0Start = recordOffsets[0];
  const record0End = recordOffsets[1];
  const record0 = source.subarray(record0Start, record0End);
  if (record0.length < 248 || readAscii(record0, 16, 4) !== "MOBI") {
    throw new MobiWorkerError("invalidMobi", "MOBI header is missing or truncated.");
  }

  const headerLength = readUInt32(record0, 20);
  const version = readUInt32(record0, 36);
  const compression = readUInt16(record0, 0);
  const encryption = readUInt16(record0, 12);
  const encoding = readUInt32(record0, 28);
  const mobiType = readUInt32(record0, 24);
  const textLength = readUInt32(record0, 4);
  const textRecordCount = readUInt16(record0, 8);
  if (headerLength < 232 || 16 + headerLength > record0.length) {
    throw new MobiWorkerError("invalidMobi", "MOBI header length is invalid.");
  }
  if (encryption !== 0) {
    throw new MobiWorkerError("encrypted", "Encrypted MOBI content cannot be previewed.");
  }
  if (version !== 6 || mobiType !== 2 || ![1, 2].includes(compression) || ![1252, 65001].includes(encoding)) {
    throw new MobiWorkerError("unsupportedMobi", "This MOBI variant is outside the supported preview range.");
  }
  if (
    textLength > MAX_DECLARED_TEXT_SIZE
    || textRecordCount < 1
    || textRecordCount + 1 > recordCount
  ) {
    throw new MobiWorkerError("tooLarge", "MOBI text exceeds the preview limit.");
  }
};

const extractHtmlText = (node: HtmlNode): string => {
  if (node.nodeName === "#text") return node.value ?? "";
  const name = String(node.tagName ?? node.nodeName ?? "").toLowerCase();
  if (["script", "style", "noscript", "svg"].includes(name)) return "";
  const content = (node.childNodes ?? []).map(extractHtmlText).join(" ");
  return ["p", "div", "li", "h1", "h2", "h3", "h4", "br"].includes(name)
    ? `${content}\n`
    : content;
};

const flattenNavigationCount = (items: Array<{ children?: unknown[] }>): number => items.reduce((total, item) => (
  total + 1 + flattenNavigationCount((item.children ?? []) as Array<{ children?: unknown[] }>)
), 0);

const renderCover = async (coverPath: string, resourceRoot: string) => {
  if (!coverPath) return null;
  const normalizedCoverPath = path.resolve(coverPath);
  const normalizedResourceRoot = `${path.resolve(resourceRoot)}${path.sep}`;
  if (!normalizedCoverPath.startsWith(normalizedResourceRoot)) {
    throw new MobiWorkerError("invalidMobi", "MOBI cover path escaped the temporary session directory.");
  }
  const stat = fs.lstatSync(normalizedCoverPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_COVER_SIZE) {
    throw new MobiWorkerError("tooLarge", "MOBI cover exceeds the preview limit.");
  }
  try {
    const png = await sharp(normalizedCoverPath)
      .resize({ width: 360, height: 480, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
};

const run = async () => {
  const source = fs.readFileSync(workerData.sourcePath) as Buffer;
  validateMobiHeader(source);
  const { initMobiFile } = await loadMobiParser();
  const book = await initMobiFile(new Uint8Array(source), workerData.resourceRoot);
  try {
    const metadata = book.getMetadata();
    const chapters: MobiPreviewChapter[] = [];
    let textLength = 0;
    let skippedChapterCount = 0;
    let truncated = false;
    for (const [index, chapter] of book.getSpine().entries()) {
      try {
        let text = extractHtmlText(parse(chapter.text) as HtmlNode)
          .replace(/[\t ]+/g, " ")
          .replace(/\n\s*/g, "\n")
          .trim();
        if (!text) {
          skippedChapterCount += 1;
          continue;
        }
        if (textLength + text.length > MAX_TEXT_LENGTH) {
          text = text.slice(0, Math.max(0, MAX_TEXT_LENGTH - textLength));
          truncated = true;
        }
        if (text) {
          chapters.push({
            title: text.split("\n")[0].slice(0, 120) || `章节 ${index + 1}`,
            text
          });
          textLength += text.length;
        }
        if (truncated) break;
      } catch {
        skippedChapterCount += 1;
      }
    }
    if (chapters.length === 0) {
      throw new MobiWorkerError("invalidMobi", "MOBI contains no readable chapters.");
    }
    const coverPath = book.getCoverImage();
    return {
      title: metadata.title || path.basename(workerData.sourcePath),
      creator: metadata.author?.filter(Boolean).join(", ") ?? "",
      chapters,
      navigationCount: flattenNavigationCount(book.getToc()),
      skippedChapterCount,
      truncated,
      coverDataUrl: await renderCover(coverPath, workerData.resourceRoot)
    };
  } finally {
    book.destroy();
  }
};

void run()
  .then((data) => parentPort?.postMessage({ ok: true, data } satisfies MobiWorkerResponse))
  .catch((error) => parentPort?.postMessage({
    ok: false,
    reason: error instanceof MobiWorkerError ? error.reason : "invalidMobi",
    message: String(error?.message || error)
  } satisfies MobiWorkerResponse));
