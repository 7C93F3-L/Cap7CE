import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { DOMParser } from "@xmldom/xmldom";
import exifr from "exifr";
import { createFileSourceRevision } from "./fileSourceRevision";
import { selectHighValueEmbeddedMetadata } from "./embeddedMetadataPolicy";
import {
  EMBEDDED_METADATA_EXTRACTOR_VERSION,
  type EmbeddedMetadataExtraction,
  type RawEmbeddedMetadata
} from "./embeddedMetadataTypes";

const opentype = require("opentype.js") as {
  parse(buffer: ArrayBuffer, options?: { lowMemory?: boolean }): {
    names: {
      windows?: Record<string, Record<string, string | undefined> | undefined>;
      macintosh?: Record<string, Record<string, string | undefined> | undefined>;
    };
  };
};

const standardMetadataExtensions = new Set([
  ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".nef", ".dng", ".cr2", ".heic", ".heif", ".avif"
]);
const xmpContainerExtensions = new Set([".psd", ".psb", ".pdf", ".ai"]);
const maximumPngTextBytes = 16 * 1024 * 1024;
const maximumPngTotalTextBytes = 32 * 1024 * 1024;
const maximumXmpPacketBytes = 1024 * 1024;
const boundedContainerReadBytes = 4 * 1024 * 1024;
const maximumFontBytes = 64 * 1024 * 1024;
const boundedMp4ReadBytes = 8 * 1024 * 1024;
const supportedEmbeddedMetadataExtensions = new Set([
  ...standardMetadataExtensions,
  ...xmpContainerExtensions,
  ".mp4", ".ttf", ".otf"
]);

export const supportsEmbeddedMetadataExtraction = (filePathOrExtension: string) => {
  const value = filePathOrExtension.trim().toLowerCase();
  const extension = value.startsWith(".") && !value.includes("\\") && !value.includes("/")
    ? value
    : path.extname(value);
  return supportedEmbeddedMetadataExtensions.has(extension);
};

const metadataPick = [
  "Title", "DocumentName", "Headline", "Description", "ImageDescription", "Subject", "Keywords", "HierarchicalSubject",
  "Software", "CreatorTool", "Make", "Model", "DateTimeOriginal", "CreateDate"
];

const toValues = (value: unknown): unknown[] => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap(toValues);
  if (typeof value === "object" && !(value instanceof Date)) return Object.values(value).flatMap(toValues);
  return [value];
};

const appendValues = (target: unknown[] | undefined, values: unknown[]) => {
  if (!target) return values;
  target.push(...values);
  return target;
};

const mergeRawMetadata = (target: RawEmbeddedMetadata, source: RawEmbeddedMetadata) => {
  for (const key of ["visualDescriptions", "titles", "subjects", "descriptions", "keywords", "software"] as const) {
    target[key] = appendValues(target[key], source[key] ?? []);
  }
  for (const key of ["cameraMake", "cameraModel", "capturedAt", "mediaTitle", "mediaArtist", "mediaAlbum", "fontFamily", "fontStyle"] as const) {
    if (target[key] === undefined && source[key] !== undefined) target[key] = source[key];
  }
};

const readAt = async (handle: fs.FileHandle, length: number, position: number) => {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
};

const decodePngTextChunk = (type: string, data: Buffer): [string, string] | null => {
  if (type === "tEXt") {
    const separator = data.indexOf(0);
    if (separator < 1) return null;
    return [data.subarray(0, separator).toString("latin1"), data.subarray(separator + 1).toString("utf8")];
  }
  if (type === "zTXt") {
    const separator = data.indexOf(0);
    if (separator < 1 || data[separator + 1] !== 0) return null;
    const text = zlib.inflateSync(data.subarray(separator + 2), { maxOutputLength: maximumPngTextBytes }).toString("utf8");
    return [data.subarray(0, separator).toString("latin1"), text];
  }
  if (type !== "iTXt") return null;
  const keywordEnd = data.indexOf(0);
  if (keywordEnd < 1 || keywordEnd + 2 >= data.length) return null;
  const compressed = data[keywordEnd + 1] === 1;
  let position = keywordEnd + 3;
  const languageEnd = data.indexOf(0, position);
  if (languageEnd < 0) return null;
  position = languageEnd + 1;
  const translatedEnd = data.indexOf(0, position);
  if (translatedEnd < 0) return null;
  const textBytes = data.subarray(translatedEnd + 1);
  const text = compressed
    ? zlib.inflateSync(textBytes, { maxOutputLength: maximumPngTextBytes }).toString("utf8")
    : textBytes.toString("utf8");
  return [data.subarray(0, keywordEnd).toString("latin1"), text];
};

const readPngText = async (filePath: string) => {
  const handle = await fs.open(filePath, "r");
  try {
    const signature = await readAt(handle, 8, 0);
    if (signature.toString("hex") !== "89504e470d0a1a0a") throw new Error("invalid-png");
    const fields: Record<string, string> = {};
    let position = 8;
    let totalTextBytes = 0;
    while (true) {
      const header = await readAt(handle, 8, position);
      if (header.length < 8) break;
      const length = header.readUInt32BE(0);
      const type = header.subarray(4, 8).toString("ascii");
      position += 8;
      if (type === "IDAT") break;
      if ((type === "tEXt" || type === "zTXt" || type === "iTXt") && length <= maximumPngTextBytes) {
        const decoded = decodePngTextChunk(type, await readAt(handle, length, position));
        if (decoded) {
          totalTextBytes += Buffer.byteLength(decoded[1]);
          if (totalTextBytes <= maximumPngTotalTextBytes) fields[decoded[0]] = decoded[1];
        }
      }
      position += length + 4;
      if (type === "IEND") break;
    }
    return fields;
  } finally {
    await handle.close();
  }
};

const collectLinkedText = (
  graph: Record<string, any>,
  reference: unknown,
  visited = new Set<string>()
): string[] => {
  if (!Array.isArray(reference) || typeof reference[0] !== "string") return [];
  const nodeId = reference[0];
  if (visited.has(nodeId)) return [];
  visited.add(nodeId);
  const node = graph[nodeId];
  if (!node || typeof node !== "object") return [];
  const texts: string[] = [];
  for (const [key, value] of Object.entries(node.inputs ?? {})) {
    if (["text", "text_g", "text_l", "prompt"].includes(key) && typeof value === "string") texts.push(value);
    else if (Array.isArray(value)) texts.push(...collectLinkedText(graph, value, visited));
  }
  return texts;
};

const parseComfyPositiveText = (rawPrompt: string) => {
  let graph: Record<string, any>;
  try {
    graph = JSON.parse(rawPrompt);
  } catch {
    graph = JSON.parse(rawPrompt.replace(/\bNaN\b/gu, "null"));
  }
  if (!graph || Array.isArray(graph) || typeof graph !== "object") return [];
  const positive: string[] = [];
  for (const node of Object.values(graph)) {
    const classType = String(node?.class_type ?? "").toLowerCase();
    const inputs = node?.inputs ?? {};
    if (classType.includes("sampler") || classType.includes("guider")) {
      positive.push(...collectLinkedText(graph, inputs.positive));
      if (classType.includes("basicguider")) positive.push(...collectLinkedText(graph, inputs.conditioning));
    }
  }
  return positive;
};

const parseA1111PositiveText = (parameters: string) => {
  const negativeIndex = parameters.search(/^Negative prompt:/imu);
  const stepsIndex = parameters.search(/^Steps:/imu);
  const end = [negativeIndex, stepsIndex].filter((index) => index >= 0).sort((left, right) => left - right)[0] ?? parameters.length;
  const positive = parameters.slice(0, end).trim();
  return positive ? [positive] : [];
};

const parseGenerationFields = (fields: Record<string, string>): RawEmbeddedMetadata => {
  const descriptions: string[] = [];
  if (fields.prompt) {
    try {
      descriptions.push(...parseComfyPositiveText(fields.prompt));
    } catch {
      // A malformed graph is isolated from other embedded metadata.
    }
  }
  if (fields.parameters) descriptions.push(...parseA1111PositiveText(fields.parameters));
  return { visualDescriptions: descriptions };
};

const parseStandardMetadata = async (filePath: string): Promise<RawEmbeddedMetadata> => {
  const metadata = await exifr.parse(filePath, {
    tiff: { pick: metadataPick },
    exif: { pick: metadataPick },
    xmp: { pick: metadataPick },
    iptc: { pick: metadataPick },
    gps: false,
    icc: false,
    jfif: false,
    ihdr: false,
    translateValues: true,
    reviveValues: true
  }) ?? {};
  return {
    titles: [...toValues(metadata.Title), ...toValues(metadata.DocumentName), ...toValues(metadata.Headline)],
    subjects: [...toValues(metadata.Subject), ...toValues(metadata.HierarchicalSubject)],
    descriptions: [...toValues(metadata.Description), ...toValues(metadata.ImageDescription)],
    keywords: toValues(metadata.Keywords),
    software: [...toValues(metadata.Software), ...toValues(metadata.CreatorTool)],
    cameraMake: metadata.Make,
    cameraModel: metadata.Model,
    capturedAt: metadata.DateTimeOriginal ?? metadata.CreateDate
  };
};

const readBoundedContainerText = async (filePath: string) => {
  const stat = await fs.stat(filePath);
  const handle = await fs.open(filePath, "r");
  try {
    const headLength = Math.min(stat.size, boundedContainerReadBytes);
    const head = await readAt(handle, headLength, 0);
    if (stat.size <= boundedContainerReadBytes) return head.toString("utf8");
    const tailLength = Math.min(stat.size - headLength, boundedContainerReadBytes);
    const tail = await readAt(handle, tailLength, stat.size - tailLength);
    return `${head.toString("utf8")}\n${tail.toString("utf8")}`;
  } finally {
    await handle.close();
  }
};

const getElementValues = (document: Document, localName: string) => {
  const values: string[] = [];
  for (const element of Array.from(document.getElementsByTagName("*"))) {
    if (element.localName !== localName) continue;
    const text = element.textContent?.trim();
    if (text) values.push(text);
  }
  return values;
};

const parseBoundedXmp = async (filePath: string): Promise<RawEmbeddedMetadata> => {
  const text = await readBoundedContainerText(filePath);
  const packets = text.match(/<x:xmpmeta\b[\s\S]*?<\/x:xmpmeta>/giu) ?? [];
  const output: RawEmbeddedMetadata = {};
  for (const packet of packets) {
    if (Buffer.byteLength(packet) > maximumXmpPacketBytes) continue;
    const document = new DOMParser().parseFromString(packet, "application/xml") as unknown as Document;
    mergeRawMetadata(output, {
      titles: getElementValues(document, "title"),
      subjects: getElementValues(document, "subject"),
      descriptions: getElementValues(document, "description"),
      keywords: [...getElementValues(document, "Keywords"), ...getElementValues(document, "HierarchicalSubject")],
      software: [...getElementValues(document, "CreatorTool"), ...getElementValues(document, "Software")]
    });
    for (const element of Array.from(document.getElementsByTagName("*"))) {
      if (element.localName !== "Description") continue;
      for (let index = 0; index < element.attributes.length; index += 1) {
        const attribute = element.attributes.item(index);
        if (!attribute) continue;
        if (attribute.localName === "CreatorTool" || attribute.localName === "Software") {
          output.software = appendValues(output.software, [attribute.value]);
        }
      }
    }
  }
  return output;
};

const selectFontName = (record: Record<string, string | undefined> | undefined) => (
  record?.en ?? record?.zh ?? Object.values(record ?? {}).find((value) => typeof value === "string")
);

const parseFontMetadata = async (filePath: string): Promise<RawEmbeddedMetadata> => {
  const stat = await fs.stat(filePath);
  if (stat.size > maximumFontBytes) throw new Error("font-too-large");
  const file = await fs.readFile(filePath);
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  const font = opentype.parse(buffer, { lowMemory: true });
  const names = font.names.windows ?? font.names.macintosh ?? {};
  return {
    fontFamily: selectFontName(names.preferredFamily) ?? selectFontName(names.fontFamily),
    fontStyle: selectFontName(names.preferredSubfamily) ?? selectFontName(names.fontSubfamily)
  };
};

interface Mp4Box { type: string; path: string; start: number; end: number }
const mp4Containers = new Set(["moov", "trak", "mdia", "minf", "stbl", "udta", "meta", "ilst"]);
const parseMp4Boxes = (buffer: Buffer, start: number, end: number, parent: string, output: Mp4Box[], depth = 0) => {
  let position = start;
  while (position + 8 <= end && depth < 10) {
    let size = buffer.readUInt32BE(position);
    const type = buffer.subarray(position + 4, position + 8).toString("latin1");
    let headerSize = 8;
    if (size === 1) {
      if (position + 16 > end) break;
      const largeSize = buffer.readBigUInt64BE(position + 8);
      if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) break;
      size = Number(largeSize);
      headerSize = 16;
    } else if (size === 0) size = end - position;
    if (size < headerSize || position + size > end) break;
    const currentPath = `${parent}/${type}`;
    output.push({ type, path: currentPath, start: position, end: position + size });
    if (mp4Containers.has(type)) {
      parseMp4Boxes(buffer, position + headerSize + (type === "meta" ? 4 : 0), position + size, currentPath, output, depth + 1);
    }
    position += size;
  }
};

const parseMp4Prompt = (buffer: Buffer) => {
  const boxes: Mp4Box[] = [];
  parseMp4Boxes(buffer, 0, buffer.length, "", boxes);
  const keysBox = boxes.find((box) => box.path === "/moov/udta/meta/keys");
  if (!keysBox) return [];
  const keys: string[] = [];
  let position = keysBox.start + 16;
  const entryCount = buffer.readUInt32BE(keysBox.start + 12);
  for (let index = 0; index < entryCount && position + 8 <= keysBox.end; index += 1) {
    const size = buffer.readUInt32BE(position);
    if (size < 8 || position + size > keysBox.end) break;
    keys.push(buffer.subarray(position + 8, position + size).toString("utf8"));
    position += size;
  }
  const descriptions: string[] = [];
  for (const box of boxes.filter((candidate) => candidate.path.startsWith("/moov/udta/meta/ilst/") && candidate.path.split("/").length === 6)) {
    const keyIndex = buffer.readUInt32BE(box.start + 4) - 1;
    if (keys[keyIndex] !== "prompt") continue;
    const dataStart = box.start + 8;
    if (dataStart + 16 > box.end || buffer.subarray(dataStart + 4, dataStart + 8).toString("ascii") !== "data") continue;
    const dataSize = buffer.readUInt32BE(dataStart);
    if (dataSize < 16 || dataStart + dataSize > box.end || dataSize > maximumPngTextBytes) continue;
    try {
      descriptions.push(...parseComfyPositiveText(buffer.subarray(dataStart + 16, dataStart + dataSize).toString("utf8")));
    } catch {
      // Ignore one malformed prompt item without reading workflow or media payloads.
    }
  }
  return descriptions;
};

const parseMp4Metadata = async (filePath: string): Promise<RawEmbeddedMetadata> => {
  const stat = await fs.stat(filePath);
  const handle = await fs.open(filePath, "r");
  try {
    const buffers: Buffer[] = [];
    if (stat.size <= boundedMp4ReadBytes * 2) buffers.push(await readAt(handle, stat.size, 0));
    else {
      buffers.push(await readAt(handle, boundedMp4ReadBytes, 0));
      const tail = await readAt(handle, boundedMp4ReadBytes, stat.size - boundedMp4ReadBytes);
      const marker = tail.lastIndexOf(Buffer.from("moov", "ascii"));
      buffers.push(marker >= 4 ? tail.subarray(marker - 4) : tail);
    }
    return { visualDescriptions: buffers.flatMap(parseMp4Prompt) };
  } finally {
    await handle.close();
  }
};

export const extractEmbeddedMetadata = async (filePath: string): Promise<EmbeddedMetadataExtraction> => {
  const normalizedPath = path.normalize(path.resolve(filePath));
  if (!path.isAbsolute(filePath)) throw new Error("source-path-not-absolute");
  const stat = await fs.lstat(normalizedPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("source-unavailable");
  const extension = path.extname(normalizedPath).toLowerCase();
  const raw: RawEmbeddedMetadata = {};
  let attempted = false;
  let successful = false;

  const attempt = async (reader: () => Promise<RawEmbeddedMetadata>) => {
    attempted = true;
    try {
      mergeRawMetadata(raw, await reader());
      successful = true;
    } catch {
      // Each format source is isolated. A second source may still provide useful evidence.
    }
  };

  if (standardMetadataExtensions.has(extension)) await attempt(() => parseStandardMetadata(normalizedPath));
  if (extension === ".png") await attempt(async () => parseGenerationFields(await readPngText(normalizedPath)));
  if (xmpContainerExtensions.has(extension)) await attempt(() => parseBoundedXmp(normalizedPath));
  if (extension === ".mp4") await attempt(() => parseMp4Metadata(normalizedPath));
  if (extension === ".ttf" || extension === ".otf") await attempt(() => parseFontMetadata(normalizedPath));

  const selected = selectHighValueEmbeddedMetadata(extension, raw);
  const failed = attempted && !successful;
  return {
    sourceRevision: createFileSourceRevision({ fileSize: stat.size, modifiedAt: stat.mtime.toISOString() }),
    extractorVersion: EMBEDDED_METADATA_EXTRACTOR_VERSION,
    status: failed ? "failed" : selected.evidence.length > 0 || selected.capturedAt ? "indexed" : "empty",
    evidence: selected.evidence,
    capturedAt: selected.capturedAt,
    errorCode: failed ? "metadata-parse-failed" : ""
  };
};
