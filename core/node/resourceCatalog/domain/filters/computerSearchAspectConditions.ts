import type { ComputerSearchAspectRange, ComputerSearchRatio } from "../../../../../src/shared/computerSearchFactTypes";
import { normalizeImageAspectRatioValue, type SearchImageAspectRatio, type SearchImageAspectRatioValue } from "../formats/imageSearchFilters";

const choices: Record<SearchImageAspectRatio, ComputerSearchAspectRange> = {
  portrait: { minimum: { numerator: 1, denominator: 2 }, maximum: { numerator: 9, denominator: 10 }, minimumInclusive: false, maximumInclusive: false },
  landscape: { minimum: { numerator: 11, denominator: 10 }, maximum: { numerator: 2, denominator: 1 }, minimumInclusive: false, maximumInclusive: false },
  square: { minimum: { numerator: 9, denominator: 10 }, maximum: { numerator: 11, denominator: 10 } },
  wide: { minimum: { numerator: 2, denominator: 1 } },
  tall: { maximum: { numerator: 1, denominator: 2 } }
};
const divisor = (left: number, right: number): number => right === 0 ? left : divisor(right, left % right);
const fraction = (numerator: number, denominator: number): ComputerSearchRatio => {
  const common = divisor(numerator, denominator); return { numerator: numerator / common, denominator: denominator / common };
};

// Existing image and video UI share the same orientation bands and 2% custom tolerance.
export const toComputerSearchAspectRanges = (presets: readonly SearchImageAspectRatio[] = [],
  values: readonly SearchImageAspectRatioValue[] = []): ComputerSearchAspectRange[] | undefined => {
  if (values.length > 32 || presets.some(preset => !Object.prototype.hasOwnProperty.call(choices, preset))) throw new Error("computer-search-invalid-aspect-selection");
  const ranges = [...new Set(presets)].map(preset => JSON.parse(JSON.stringify(choices[preset])) as ComputerSearchAspectRange);
  const custom = new Set<string>();
  for (const value of values) {
    const normalized = normalizeImageAspectRatioValue(value);
    if (!normalized) throw new Error("computer-search-invalid-aspect-selection");
    const key = `${normalized.width}:${normalized.height}`;
    if (custom.has(key)) continue;
    custom.add(key);
    ranges.push({ minimum: fraction(normalized.width * 49, normalized.height * 50),
      maximum: fraction(normalized.width * 51, normalized.height * 50) });
  }
  return ranges.length ? ranges : undefined;
};
