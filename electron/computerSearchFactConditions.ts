import type { ComputerSearchFacts, ComputerSearchRatio, ComputerSearchAspectRange, ComputerSearchIntegerRange } from "../src/shared/computerSearchFactTypes";
import { CORE_IMAGE_METADATA_EXTRACTOR_VERSION } from "./metadataExtraction/imageMetadataMetrics";
import { CORE_VIDEO_METADATA_EXTRACTOR_VERSION as VIDEO_FACT_EXTRACTOR_VERSION } from "./metadataExtraction/videoMetadataFrames";
import { AUDIO_FACT_EXTRACTOR_VERSION } from "./audioFactTypes";
import { FONT_FACT_EXTRACTOR_VERSION } from "./fontFactTypes";
import { MODEL_FACT_EXTRACTOR_VERSION } from "./modelFactTypes";
import { DOCUMENT_FACT_EXTRACTOR_VERSION } from "./documentFactTypes";
import { THREE_D_FACT_EXTRACTOR_VERSION } from "./threeDFactTypes";
import { TEXT_DATA_FACT_EXTRACTOR_VERSION } from "./textDataFactTypes";
import { readComputerSearchTextData } from "./computerSearchTextDataConditions";
import { readComputerSearchThreeD } from "./computerSearchThreeDConditions";
import { readComputerSearchDocument } from "./computerSearchDocumentConditions";
import { readComputerSearchModel } from "./computerSearchModelConditions";
import { readComputerSearchFont } from "./computerSearchFontConditions";
import { readComputerSearchVisualGroups } from "./computerSearchVisualConditions";

import { ARCHIVE_FACT_EXTRACTOR_VERSION } from "./archiveFactTypes";
import { readComputerSearchArchive } from "./computerSearchArchiveConditions";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const fields = ["kind", "minimumWidth", "maximumWidth", "minimumHeight", "maximumHeight",
  "minimumDurationMilliseconds", "maximumDurationMilliseconds", "minimumAspectRatio", "maximumAspectRatio", "aspectRanges", "shortEdgeRanges", "isAnimated", "visualGroups", "channelRanges", "font", "model", "document", "threeD", "textData", "archive"];
const invalid = (): never => { throw new Error("computer-search-invalid-facts"); };
const ratio = (value: unknown, maximum = 1_000_000): ComputerSearchRatio => {
  if (!record(value) || Object.keys(value).some(key => !["numerator", "denominator"].includes(key))
    || ![value.numerator, value.denominator].every(number => Number.isSafeInteger(number) && Number(number) >= 1 && Number(number) <= maximum)) return invalid();
  return { numerator: value.numerator as number, denominator: value.denominator as number };
};
export const readComputerSearchFacts = (value: unknown): ComputerSearchFacts | undefined => {
  if (value === undefined) return undefined;
  if (!record(value) || typeof value.kind !== "string" || !["image-dimensions", "video", "audio", "font", "model", "document", "three-d", "text-data", "archive"].includes(value.kind)
    || Object.keys(value).some(key => !fields.includes(key))) return invalid();
  const result: ComputerSearchFacts = { kind: value.kind as ComputerSearchFacts["kind"] };
  if (value.isAnimated !== undefined) {
    if (result.kind !== "image-dimensions" || typeof value.isAnimated !== "boolean") return invalid();
    result.isAnimated = value.isAnimated;
  }
  if (value.visualGroups !== undefined) {
    if (!["image-dimensions", "video"].includes(result.kind)) return invalid();
    result.visualGroups = readComputerSearchVisualGroups(value.visualGroups);
  }
  for (const field of ["minimumWidth", "maximumWidth", "minimumHeight", "maximumHeight",
    "minimumDurationMilliseconds", "maximumDurationMilliseconds"] as const) {
    if (value[field] === undefined) continue;
    const duration = field.includes("Duration");
    if (!Number.isSafeInteger(value[field]) || Number(value[field]) < (duration ? 0 : 1)
      || !duration && (Number(value[field]) > 2_147_483_647 || result.kind === "audio" || ["font", "model", "document", "three-d", "text-data", "archive"].includes(result.kind))
      || duration && !["video", "audio"].includes(result.kind)) return invalid();
    result[field] = value[field] as number;
  }
  for (const field of ["minimumAspectRatio", "maximumAspectRatio"] as const) {
    if (value[field] !== undefined) result[field] = ratio(value[field]);
  }
  if (value.aspectRanges !== undefined) {
    if (!Array.isArray(value.aspectRanges) || value.aspectRanges.length < 1 || value.aspectRanges.length > 40) return invalid();
    result.aspectRanges = value.aspectRanges.map(input => {
      if (!record(input) || Object.keys(input).some(key => !["minimum", "maximum", "minimumInclusive", "maximumInclusive"].includes(key))
        || input.minimum === undefined && input.maximum === undefined) return invalid();
      const range: ComputerSearchAspectRange = {};
      for (const field of ["minimum", "maximum"] as const) if (input[field] !== undefined) range[field] = ratio(input[field], 10_000_000);
      for (const field of ["minimumInclusive", "maximumInclusive"] as const) if (input[field] !== undefined) {
        if (typeof input[field] !== "boolean") return invalid();
        range[field] = input[field];
      }
      const low = range.minimum, high = range.maximum;
      if (low && high) {
        const comparison = low.numerator * high.denominator - high.numerator * low.denominator;
        if (comparison > 0 || comparison === 0 && (range.minimumInclusive === false || range.maximumInclusive === false)) return invalid();
      }
      return range;
    });
  }
  if (value.shortEdgeRanges !== undefined) {
    if (!Array.isArray(value.shortEdgeRanges) || value.shortEdgeRanges.length < 1 || value.shortEdgeRanges.length > 16) return invalid();
    result.shortEdgeRanges = value.shortEdgeRanges.map(input => {
      if (!record(input) || Object.keys(input).some(key => !["minimum", "maximum"].includes(key))
        || input.minimum === undefined && input.maximum === undefined) return invalid();
      const range: ComputerSearchIntegerRange = {};
      for (const field of ["minimum", "maximum"] as const) if (input[field] !== undefined) {
        if (!Number.isSafeInteger(input[field]) || Number(input[field]) < 1 || Number(input[field]) > 2_147_483_647) return invalid();
        range[field] = input[field] as number;
      }
      if (range.minimum !== undefined && range.maximum !== undefined && range.minimum > range.maximum) return invalid();
      return range;
    });
  }
  for (const [low, high] of [[result.minimumWidth, result.maximumWidth], [result.minimumHeight, result.maximumHeight],
    [result.minimumDurationMilliseconds, result.maximumDurationMilliseconds]]) {
    if (low !== undefined && high !== undefined && low > high) return invalid();
  }
  const low = result.minimumAspectRatio, high = result.maximumAspectRatio;
  if (["audio", "font", "model", "document", "three-d", "text-data", "archive"].includes(result.kind) && (low || high || result.aspectRanges || result.shortEdgeRanges)) return invalid();
  if (value.archive !== undefined) {
    if (result.kind !== "archive") return invalid();
    result.archive = readComputerSearchArchive(value.archive);
  }
  if (value.textData !== undefined) {
    if (result.kind !== "text-data") return invalid();
    result.textData = readComputerSearchTextData(value.textData);
  }
  if (value.threeD !== undefined) {
    if (result.kind !== "three-d") return invalid();
    result.threeD = readComputerSearchThreeD(value.threeD);
  }
  if (value.document !== undefined) {
    if (result.kind !== "document") return invalid();
    result.document = readComputerSearchDocument(value.document);
  }
  if (value.model !== undefined) {
    if (result.kind !== "model") return invalid();
    result.model = readComputerSearchModel(value.model);
  }
  if (value.font !== undefined) {
    if (result.kind !== "font") return invalid();
    result.font = readComputerSearchFont(value.font);
  }
  if (value.channelRanges !== undefined) {
    if (result.kind !== "audio" || !Array.isArray(value.channelRanges) || value.channelRanges.length < 1 || value.channelRanges.length > 3) return invalid();
    result.channelRanges = value.channelRanges.map(input => {
      if (!record(input) || Object.keys(input).some(key => !["minimum", "maximum"].includes(key))
        || input.minimum === undefined && input.maximum === undefined) return invalid();
      const range: ComputerSearchIntegerRange = {};
      for (const field of ["minimum", "maximum"] as const) if (input[field] !== undefined) {
        if (!Number.isSafeInteger(input[field]) || Number(input[field]) < 1 || Number(input[field]) > 2_147_483_647) return invalid();
        range[field] = input[field] as number;
      }
      if (range.minimum !== undefined && range.maximum !== undefined && range.minimum > range.maximum) return invalid();
      return range;
    });
  }
  if (low && high && low.numerator * high.denominator > high.numerator * low.denominator) return invalid();
  return result;
};
export const toCoreSearchFacts = (value: unknown) => {
  const facts = readComputerSearchFacts(value);
  return facts ? { ...facts, extractorVersion: facts.kind === "video" ? VIDEO_FACT_EXTRACTOR_VERSION : facts.kind === "audio" ? AUDIO_FACT_EXTRACTOR_VERSION
    : facts.kind === "archive" ? ARCHIVE_FACT_EXTRACTOR_VERSION : facts.kind === "text-data" ? TEXT_DATA_FACT_EXTRACTOR_VERSION : facts.kind === "three-d" ? THREE_D_FACT_EXTRACTOR_VERSION : facts.kind === "document" ? DOCUMENT_FACT_EXTRACTOR_VERSION : facts.kind === "model" ? MODEL_FACT_EXTRACTOR_VERSION : facts.kind === "font" ? FONT_FACT_EXTRACTOR_VERSION : CORE_IMAGE_METADATA_EXTRACTOR_VERSION } : undefined;
};
