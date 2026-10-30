import { normalizeSearchCountRange } from "./textDataSearchFilters";

export const searchArtboardCountPresets = ["one", "2-5", "6-10", "11-20", "over-20"] as const;
export type SearchArtboardCountPreset = typeof searchArtboardCountPresets[number];

export const hasArtboardSearchFacet = (search: {
  artboardCountPreset?: unknown;
  artboardCountRange?: unknown;
}) => Boolean(search.artboardCountPreset || search.artboardCountRange);

export const matchesArtboardCount = (count: number, preset: unknown, range: unknown) => {
  const normalizedRange = normalizeSearchCountRange(range);
  if (normalizedRange) {
    return (normalizedRange.minCount === undefined || count >= normalizedRange.minCount)
      && (normalizedRange.maxCount === undefined || count <= normalizedRange.maxCount);
  }
  if (!searchArtboardCountPresets.includes(preset as SearchArtboardCountPreset)) return true;
  if (preset === "one") return count === 1;
  if (preset === "2-5") return count >= 2 && count <= 5;
  if (preset === "6-10") return count >= 6 && count <= 10;
  if (preset === "11-20") return count >= 11 && count <= 20;
  return count > 20;
};
