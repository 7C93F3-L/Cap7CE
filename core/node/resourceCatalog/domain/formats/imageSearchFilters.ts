export const searchVisualColors = [
  "red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink",
  "black-background", "gray-tone", "white-background", "transparent-background"
] as const;
export type SearchVisualColor = typeof searchVisualColors[number];

export const searchImageColorTraits = ["bright-image", "dark-image", "vivid-image", "muted-image"] as const;
export type SearchImageColorTrait = typeof searchImageColorTraits[number];

export const searchImageAnimationModes = ["animated", "static"] as const;
export type SearchImageAnimationMode = typeof searchImageAnimationModes[number];

export const searchImageAspectRatios = ["portrait", "landscape", "square", "wide", "tall"] as const;
export type SearchImageAspectRatio = typeof searchImageAspectRatios[number];

export interface SearchImageAspectRatioValue { width: number; height: number; }
export type SearchImageDimensionFilter =
  | { mode: "range"; minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number }
  | { mode: "exact"; width: number; height: number };

const isPixelValue = (value: unknown) => Number.isInteger(value) && Number(value) > 0 && Number(value) <= 100_000;
const greatestCommonDivisor = (left: number, right: number): number => right === 0 ? left : greatestCommonDivisor(right, left % right);

export const normalizeImageAspectRatioValue = (value: unknown): SearchImageAspectRatioValue | null => {
  if (!value || typeof value !== "object") return null;
  const { width, height } = value as Record<string, unknown>;
  if (!isPixelValue(width) || !isPixelValue(height)) return null;
  const divisor = greatestCommonDivisor(Number(width), Number(height));
  return { width: Number(width) / divisor, height: Number(height) / divisor };
};

export const normalizeImageAspectRatioValues = (values: unknown): SearchImageAspectRatioValue[] => {
  if (!Array.isArray(values)) return [];
  const normalized = values.slice(0, 32).map(normalizeImageAspectRatioValue).filter((value): value is SearchImageAspectRatioValue => value !== null);
  return [...new Map(normalized.map((value) => [`${value.width}:${value.height}`, value])).values()];
};

export const normalizeImageDimensionFilter = (value: unknown): SearchImageDimensionFilter | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.mode === "exact") return isPixelValue(candidate.width) && isPixelValue(candidate.height)
    ? { mode: "exact", width: Number(candidate.width), height: Number(candidate.height) } : null;
  if (candidate.mode !== "range") return null;
  const result: Extract<SearchImageDimensionFilter, { mode: "range" }> = { mode: "range" };
  for (const key of ["minWidth", "minHeight", "maxWidth", "maxHeight"] as const) {
    if (candidate[key] !== undefined && !isPixelValue(candidate[key])) return null;
    if (candidate[key] !== undefined) result[key] = Number(candidate[key]);
  }
  if (result.minWidth && result.maxWidth && result.minWidth > result.maxWidth) return null;
  if (result.minHeight && result.maxHeight && result.minHeight > result.maxHeight) return null;
  return Object.keys(result).length > 1 ? result : null;
};

export const hasImageSearchFacets = (search: {
  visualColors?: readonly unknown[]; imageColorTraits?: readonly unknown[]; imageAspectRatios?: readonly unknown[];
  imageAspectRatioValues?: readonly unknown[]; imageDimensionFilter?: unknown; imageAnimation?: unknown;
}) => Boolean(search.visualColors?.length || search.imageColorTraits?.length || search.imageAspectRatios?.length || search.imageAspectRatioValues?.length || search.imageDimensionFilter || search.imageAnimation);
