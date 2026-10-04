import { searchImageColorTraits, type SearchImageColorTrait, type SearchVisualColor } from "./imageSearchFilters";

export const searchVideoVisualColors = [
  "red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink",
  "black-background", "gray-tone", "white-background"
] as const satisfies readonly SearchVisualColor[];
export type SearchVideoVisualColor = typeof searchVideoVisualColors[number];

export const searchVideoColorTraits = searchImageColorTraits;
export type SearchVideoColorTrait = SearchImageColorTrait;

export const searchVideoDurationPresets = ["under-15s", "15s-1m", "1m-5m", "over-5m"] as const;
export type SearchVideoDurationPreset = typeof searchVideoDurationPresets[number];

export const searchVideoAspectRatios = ["portrait", "landscape", "square", "wide", "tall"] as const;
export type SearchVideoAspectRatio = typeof searchVideoAspectRatios[number];

export const searchVideoResolutions = ["720p", "1080p", "2k", "4k", "8k"] as const;
export type SearchVideoResolution = typeof searchVideoResolutions[number];

export interface SearchVideoDurationRange { minSeconds?: number; maxSeconds?: number }
export interface SearchVideoAspectRatioValue { width: number; height: number }
export type SearchVideoDimensionFilter =
  | { mode: "range"; minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number }
  | { mode: "exact"; width: number; height: number };

const isDimensionValue = (value: unknown) => Number.isInteger(value) && Number(value) > 0 && Number(value) <= 100_000;
const greatestCommonDivisor = (left: number, right: number): number => right === 0 ? left : greatestCommonDivisor(right, left % right);

export const normalizeVideoDurationRange = (value: unknown): SearchVideoDurationRange | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const minSeconds = candidate.minSeconds === undefined ? undefined : Number(candidate.minSeconds);
  const maxSeconds = candidate.maxSeconds === undefined ? undefined : Number(candidate.maxSeconds);
  if (minSeconds !== undefined && (!Number.isFinite(minSeconds) || minSeconds < 0 || minSeconds > 604_800)) return null;
  if (maxSeconds !== undefined && (!Number.isFinite(maxSeconds) || maxSeconds <= 0 || maxSeconds > 604_800)) return null;
  if (minSeconds === undefined && maxSeconds === undefined) return null;
  if (minSeconds !== undefined && maxSeconds !== undefined && minSeconds > maxSeconds) return null;
  return { ...(minSeconds === undefined ? {} : { minSeconds }), ...(maxSeconds === undefined ? {} : { maxSeconds }) };
};

export const normalizeVideoAspectRatioValue = (value: unknown): SearchVideoAspectRatioValue | null => {
  if (!value || typeof value !== "object") return null;
  const { width, height } = value as Record<string, unknown>;
  if (!isDimensionValue(width) || !isDimensionValue(height)) return null;
  const divisor = greatestCommonDivisor(Number(width), Number(height));
  return { width: Number(width) / divisor, height: Number(height) / divisor };
};

export const normalizeVideoAspectRatioValues = (values: unknown): SearchVideoAspectRatioValue[] => {
  if (!Array.isArray(values)) return [];
  const normalized = values.slice(0, 32).map(normalizeVideoAspectRatioValue).filter((value): value is SearchVideoAspectRatioValue => value !== null);
  return [...new Map(normalized.map((value) => [`${value.width}:${value.height}`, value])).values()];
};

export const normalizeVideoDimensionFilter = (value: unknown): SearchVideoDimensionFilter | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.mode === "exact") return isDimensionValue(candidate.width) && isDimensionValue(candidate.height)
    ? { mode: "exact", width: Number(candidate.width), height: Number(candidate.height) } : null;
  if (candidate.mode !== "range") return null;
  const result: Extract<SearchVideoDimensionFilter, { mode: "range" }> = { mode: "range" };
  for (const key of ["minWidth", "minHeight", "maxWidth", "maxHeight"] as const) {
    if (candidate[key] !== undefined && !isDimensionValue(candidate[key])) return null;
    if (candidate[key] !== undefined) result[key] = Number(candidate[key]);
  }
  if (result.minWidth && result.maxWidth && result.minWidth > result.maxWidth) return null;
  if (result.minHeight && result.maxHeight && result.minHeight > result.maxHeight) return null;
  return Object.keys(result).length > 1 ? result : null;
};

export const hasVideoMetadataSearchFacets = (search: {
  videoDurationPreset?: unknown; videoDurationRange?: unknown; videoAspectRatios?: readonly unknown[];
  videoAspectRatioValues?: readonly unknown[]; videoResolutions?: readonly unknown[]; videoDimensionFilter?: unknown;
}) => Boolean(search.videoDurationPreset || search.videoDurationRange || search.videoAspectRatios?.length
  || search.videoAspectRatioValues?.length || search.videoResolutions?.length || search.videoDimensionFilter);

export const hasVideoColorSearchFacets = (search: {
  videoVisualColors?: readonly unknown[];
  videoColorTraits?: readonly unknown[];
}) => Boolean(search.videoVisualColors?.length || search.videoColorTraits?.length);

export const hasVideoSearchFacets = (search: Parameters<typeof hasVideoMetadataSearchFacets>[0] & Parameters<typeof hasVideoColorSearchFacets>[0]) => (
  hasVideoMetadataSearchFacets(search) || hasVideoColorSearchFacets(search)
);
