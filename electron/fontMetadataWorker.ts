import fs from "node:fs";
import { parentPort, workerData } from "node:worker_threads";
import type { FontMetadataWorkerRequest, FontMetadataWorkerResponse } from "./fontPreviewTypes";

interface LocalizedNameRecord {
  [language: string]: string | undefined;
}

interface ParsedOpenTypeFont {
  names: {
    windows?: Record<string, LocalizedNameRecord | undefined>;
    macintosh?: Record<string, LocalizedNameRecord | undefined>;
  };
  numGlyphs: number;
  charToGlyphIndex(character: string): number;
  tables: {
    os2?: { usWeightClass?: number };
    fvar?: { axes?: Array<{ tag: string; minValue: number; defaultValue: number; maxValue: number }> };
  };
}

const opentype = require("opentype.js") as {
  parse(buffer: ArrayBuffer, options?: { lowMemory?: boolean }): ParsedOpenTypeFont;
};

const maximumMetadataTextLength = 256;
const maximumVariationAxes = 16;
const latinSample = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const chineseSample = "物无非彼物无非是自彼则不见自之则知之";

const selectName = (record: LocalizedNameRecord | undefined, language: FontMetadataWorkerRequest["language"]) => {
  if (!record) return null;
  const preferred = language === "zh-CN" ? record.zh : record.en;
  const fallback = preferred ?? record.en ?? record.zh ?? Object.values(record).find((value) => typeof value === "string");
  return fallback?.trim().slice(0, maximumMetadataTextLength) || null;
};

const coversSample = (font: ParsedOpenTypeFont, sample: string) => (
  [...sample].filter((character) => character.trim()).every((character) => font.charToGlyphIndex(character) !== 0)
);

const run = () => {
  const request = workerData as FontMetadataWorkerRequest;
  const file = fs.readFileSync(request.sourcePath);
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  const font = opentype.parse(buffer, { lowMemory: true });
  const names = font.names.windows ?? font.names.macintosh ?? {};
  const familyName = selectName(names.preferredFamily, request.language)
    ?? selectName(names.fontFamily, request.language);
  const styleName = selectName(names.preferredSubfamily, request.language)
    ?? selectName(names.fontSubfamily, request.language)
    ?? "Regular";
  if (!familyName || !Number.isSafeInteger(font.numGlyphs) || font.numGlyphs <= 0) {
    throw new Error("Font metadata is incomplete.");
  }
  const response: FontMetadataWorkerResponse = {
    ok: true,
    data: {
      familyName,
      styleName,
      weight: Math.min(1000, Math.max(1, font.tables.os2?.usWeightClass ?? 400)),
      glyphCount: font.numGlyphs,
      supportsLatinSample: coversSample(font, latinSample),
      supportsChineseSample: coversSample(font, chineseSample),
      variationAxes: (font.tables.fvar?.axes ?? []).slice(0, maximumVariationAxes).map((axis) => ({
        tag: axis.tag.slice(0, 4),
        minimum: axis.minValue,
        defaultValue: axis.defaultValue,
        maximum: axis.maxValue
      }))
    }
  };
  parentPort?.postMessage(response);
};

try {
  run();
} catch (error) {
  const response: FontMetadataWorkerResponse = {
    ok: false,
    message: error instanceof Error ? error.message : "Font metadata parsing failed."
  };
  parentPort?.postMessage(response);
}
