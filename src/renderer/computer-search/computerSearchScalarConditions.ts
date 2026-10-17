import type { SearchState } from "../../shared/types";
import type { ComputerSearchConditions, ComputerSearchFacts, ComputerSearchIntegerRange } from "../../shared/computerSearchFactTypes";
import { normalizeImageDimensionFilter } from "../../../electron/imageSearchFilters";
import { normalizeVideoDimensionFilter, normalizeVideoDurationRange, searchVideoResolutions } from "../../../electron/videoSearchFilters";
import { toComputerSearchBaseConditions } from "./computerSearchBaseConditions";
import { toComputerSearchAspectRanges } from "./computerSearchAspectConditions";

type ScalarSelection = Pick<SearchState, "fileFormat" | "includedExtensions" | "selectedExtensions" | "unclassifiedOnly" | "timePreset" | "modifiedTimeRange"
  | "fileSizePreset" | "fileSizeRange" | "imageDimensionFilter" | "imageAspectRatios" | "imageAspectRatioValues"
  | "videoDimensionFilter" | "videoAspectRatios" | "videoAspectRatioValues" | "videoDurationPreset" | "videoDurationRange" | "videoResolutions">;
const resolutionRanges: Record<string, ComputerSearchIntegerRange> = {
  "720p": { minimum: 720, maximum: 1079 }, "1080p": { minimum: 1080, maximum: 1439 },
  "2k": { minimum: 1440, maximum: 2159 }, "4k": { minimum: 2160, maximum: 4319 }, "8k": { minimum: 4320 }
};
// Convert the user's decimal seconds without introducing a one-millisecond floating-point boundary error.
export const toComputerSearchMilliseconds = (seconds: number, roundUp: boolean): number => {
  const [coefficient, exponent = "0"] = seconds.toString().toLowerCase().split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  const digits = BigInt(whole + fraction), scale = fraction.length - Number(exponent) - 3;
  if (scale <= 0) return Number(digits * 10n ** BigInt(-scale));
  const denominator = 10n ** BigInt(scale);
  return Number((digits + (roundUp ? denominator - 1n : 0n)) / denominator);
};

// Covers supported scalar facets only; color/animation/other-media adapters belong to their own fact domains.
export const toComputerSearchScalarConditions = (search: ScalarSelection, referenceNow = new Date()): ComputerSearchConditions => {
  const fileConditions = toComputerSearchBaseConditions(search, referenceNow);
  const image = Boolean(search.imageDimensionFilter || search.imageAspectRatios?.length || search.imageAspectRatioValues?.length);
  const video = Boolean(search.videoDimensionFilter || search.videoAspectRatios?.length || search.videoAspectRatioValues?.length
    || search.videoDurationPreset || search.videoDurationRange || search.videoResolutions?.length);
  if (image && video) throw new Error("computer-search-mixed-media-conditions");
  if (!image && !video) return fileConditions ? { fileConditions } : {};
  const facts: ComputerSearchFacts = { kind: image ? "image-dimensions" : "video" };
  const rawDimensions = image ? search.imageDimensionFilter : search.videoDimensionFilter;
  const dimensions = image ? normalizeImageDimensionFilter(rawDimensions) : normalizeVideoDimensionFilter(rawDimensions);
  if (rawDimensions && !dimensions) throw new Error("computer-search-invalid-dimensions");
  if (dimensions?.mode === "exact") {
    facts.minimumWidth = facts.maximumWidth = dimensions.width; facts.minimumHeight = facts.maximumHeight = dimensions.height;
  } else if (dimensions) {
    if (dimensions.minWidth !== undefined) facts.minimumWidth = dimensions.minWidth;
    if (dimensions.maxWidth !== undefined) facts.maximumWidth = dimensions.maxWidth;
    if (dimensions.minHeight !== undefined) facts.minimumHeight = dimensions.minHeight;
    if (dimensions.maxHeight !== undefined) facts.maximumHeight = dimensions.maxHeight;
  }
  const aspects = toComputerSearchAspectRanges(image ? search.imageAspectRatios : search.videoAspectRatios,
    image ? search.imageAspectRatioValues : search.videoAspectRatioValues);
  if (aspects) facts.aspectRanges = aspects;
  if (video) {
    const duration = normalizeVideoDurationRange(search.videoDurationRange);
    if (search.videoDurationRange && !duration) throw new Error("computer-search-invalid-duration");
    if (duration) {
      if (duration.minSeconds !== undefined) facts.minimumDurationMilliseconds = toComputerSearchMilliseconds(duration.minSeconds, true);
      if (duration.maxSeconds !== undefined) facts.maximumDurationMilliseconds = toComputerSearchMilliseconds(duration.maxSeconds, false);
      if (facts.minimumDurationMilliseconds !== undefined && facts.maximumDurationMilliseconds !== undefined
        && facts.minimumDurationMilliseconds > facts.maximumDurationMilliseconds) return { fileConditions: { ...fileConditions, extensions: [] } };
    } else if (search.videoDurationPreset) {
      const preset = search.videoDurationPreset;
      if (preset === "under-15s") facts.maximumDurationMilliseconds = 14999;
      else if (preset === "15s-1m") { facts.minimumDurationMilliseconds = 15000; facts.maximumDurationMilliseconds = 59999; }
      else if (preset === "1m-5m") { facts.minimumDurationMilliseconds = 60000; facts.maximumDurationMilliseconds = 299999; }
      else if (preset === "over-5m") facts.minimumDurationMilliseconds = 300000;
      else throw new Error("computer-search-invalid-duration");
    }
    if (search.videoResolutions?.length) {
      if (search.videoResolutions.some(value => !searchVideoResolutions.includes(value))) throw new Error("computer-search-invalid-resolution");
      facts.shortEdgeRanges = [...new Set(search.videoResolutions)].map(value => ({ ...resolutionRanges[value] }));
    }
  }
  return { ...(fileConditions ? { fileConditions } : {}), facts };
};
