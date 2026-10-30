export const searchTextCharacterCountPresets = ["up-to-100", "101-1000", "1001-10000", "10001-100000", "over-100000"] as const;
export type SearchTextCharacterCountPreset = typeof searchTextCharacterCountPresets[number];
export const searchTextLineCountPresets = ["up-to-10", "11-50", "51-200", "201-1000", "over-1000"] as const;
export type SearchTextLineCountPreset = typeof searchTextLineCountPresets[number];
export const searchDataRecordCountPresets = ["up-to-10", "11-100", "101-1000", "1001-10000", "over-10000"] as const;
export type SearchDataRecordCountPreset = typeof searchDataRecordCountPresets[number];
export const searchDataColumnCountPresets = ["one", "2-5", "6-10", "11-30", "over-30"] as const;
export type SearchDataColumnCountPreset = typeof searchDataColumnCountPresets[number];
export const searchJsonRootKinds = ["array", "object"] as const;
export type SearchJsonRootKind = typeof searchJsonRootKinds[number];

export interface SearchCountRange { minCount?: number; maxCount?: number }

export const normalizeSearchCountRange = (value: unknown): SearchCountRange | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const minCount = candidate.minCount === undefined ? undefined : Number(candidate.minCount);
  const maxCount = candidate.maxCount === undefined ? undefined : Number(candidate.maxCount);
  if (minCount !== undefined && (!Number.isSafeInteger(minCount) || minCount < 0 || minCount > 1_000_000_000)) return null;
  if (maxCount !== undefined && (!Number.isSafeInteger(maxCount) || maxCount < 0 || maxCount > 1_000_000_000)) return null;
  if (minCount === undefined && maxCount === undefined) return null;
  if (minCount !== undefined && maxCount !== undefined && minCount > maxCount) return null;
  return { ...(minCount === undefined ? {} : { minCount }), ...(maxCount === undefined ? {} : { maxCount }) };
};

const matchesRange = (count: number, range: unknown) => {
  const normalized = normalizeSearchCountRange(range);
  if (!normalized) return null;
  return (normalized.minCount === undefined || count >= normalized.minCount)
    && (normalized.maxCount === undefined || count <= normalized.maxCount);
};

export const matchesTextCharacterCount = (count: number, preset: unknown, range: unknown) => {
  const rangeMatch = matchesRange(count, range);
  if (rangeMatch !== null) return rangeMatch;
  if (!searchTextCharacterCountPresets.includes(preset as SearchTextCharacterCountPreset)) return true;
  if (preset === "up-to-100") return count <= 100;
  if (preset === "101-1000") return count >= 101 && count <= 1_000;
  if (preset === "1001-10000") return count >= 1_001 && count <= 10_000;
  if (preset === "10001-100000") return count >= 10_001 && count <= 100_000;
  return count > 100_000;
};

export const matchesTextLineCount = (count: number, preset: unknown, range: unknown) => {
  const rangeMatch = matchesRange(count, range);
  if (rangeMatch !== null) return rangeMatch;
  if (!searchTextLineCountPresets.includes(preset as SearchTextLineCountPreset)) return true;
  if (preset === "up-to-10") return count <= 10;
  if (preset === "11-50") return count >= 11 && count <= 50;
  if (preset === "51-200") return count >= 51 && count <= 200;
  if (preset === "201-1000") return count >= 201 && count <= 1_000;
  return count > 1_000;
};

export const matchesDataRecordCount = (count: number, preset: unknown, range: unknown) => {
  const rangeMatch = matchesRange(count, range);
  if (rangeMatch !== null) return rangeMatch;
  if (!searchDataRecordCountPresets.includes(preset as SearchDataRecordCountPreset)) return true;
  if (preset === "up-to-10") return count <= 10;
  if (preset === "11-100") return count >= 11 && count <= 100;
  if (preset === "101-1000") return count >= 101 && count <= 1_000;
  if (preset === "1001-10000") return count >= 1_001 && count <= 10_000;
  return count > 10_000;
};

export const matchesDataColumnCount = (count: number, preset: unknown, range: unknown) => {
  const rangeMatch = matchesRange(count, range);
  if (rangeMatch !== null) return rangeMatch;
  if (!searchDataColumnCountPresets.includes(preset as SearchDataColumnCountPreset)) return true;
  if (preset === "one") return count === 1;
  if (preset === "2-5") return count >= 2 && count <= 5;
  if (preset === "6-10") return count >= 6 && count <= 10;
  if (preset === "11-30") return count >= 11 && count <= 30;
  return count > 30;
};

export const hasTextSearchFacets = (search: {
  textCharacterCountPreset?: unknown;
  textCharacterCountRange?: unknown;
  textLineCountPreset?: unknown;
  textLineCountRange?: unknown;
}) => Boolean(search.textCharacterCountPreset || search.textCharacterCountRange || search.textLineCountPreset || search.textLineCountRange);

export const hasCsvSearchFacets = (search: {
  csvRecordCountPreset?: unknown;
  csvRecordCountRange?: unknown;
  csvColumnCountPreset?: unknown;
  csvColumnCountRange?: unknown;
}) => Boolean(search.csvRecordCountPreset || search.csvRecordCountRange || search.csvColumnCountPreset || search.csvColumnCountRange);

export const hasJsonSearchFacets = (search: {
  jsonItemCountPreset?: unknown;
  jsonItemCountRange?: unknown;
  jsonRootKind?: unknown;
}) => Boolean(search.jsonItemCountPreset || search.jsonItemCountRange || search.jsonRootKind);

export const hasTextDataSearchFacets = (search: Parameters<typeof hasTextSearchFacets>[0] & Parameters<typeof hasCsvSearchFacets>[0] & Parameters<typeof hasJsonSearchFacets>[0]) => (
  hasTextSearchFacets(search) || hasCsvSearchFacets(search) || hasJsonSearchFacets(search)
);
