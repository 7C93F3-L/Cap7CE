export const searchArchiveContentTypes = ["image", "video", "audio", "document", "project", "threeD", "program", "other"] as const;
export type SearchArchiveContentType = typeof searchArchiveContentTypes[number];

export const searchArchiveEntryCountPresets = ["under-10", "10-100", "100-1000", "over-1000"] as const;
export type SearchArchiveEntryCountPreset = typeof searchArchiveEntryCountPresets[number];

export const searchArchiveStructures = ["flat", "nested"] as const;
export type SearchArchiveStructure = typeof searchArchiveStructures[number];

export interface SearchArchiveEntryCountRange { minCount?: number; maxCount?: number }

export const normalizeArchiveEntryCountRange = (value: unknown): SearchArchiveEntryCountRange | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const minCount = candidate.minCount === undefined ? undefined : Number(candidate.minCount);
  const maxCount = candidate.maxCount === undefined ? undefined : Number(candidate.maxCount);
  if (minCount !== undefined && (!Number.isSafeInteger(minCount) || minCount < 0 || minCount > 2_000_000_000)) return null;
  if (maxCount !== undefined && (!Number.isSafeInteger(maxCount) || maxCount < 0 || maxCount > 2_000_000_000)) return null;
  if (minCount === undefined && maxCount === undefined) return null;
  if (minCount !== undefined && maxCount !== undefined && minCount > maxCount) return null;
  return { ...(minCount === undefined ? {} : { minCount }), ...(maxCount === undefined ? {} : { maxCount }) };
};

export const hasArchiveSearchFacets = (search: {
  archiveContentTypes?: readonly unknown[];
  archiveEntryCountPreset?: unknown;
  archiveEntryCountRange?: unknown;
  archiveStructures?: readonly unknown[];
}) => Boolean(search.archiveContentTypes?.length || search.archiveEntryCountPreset || search.archiveEntryCountRange || search.archiveStructures?.length);

export const matchesArchiveEntryCount = (count: number, preset: unknown, range: unknown) => {
  const normalizedRange = normalizeArchiveEntryCountRange(range);
  if (normalizedRange) {
    if (normalizedRange.minCount !== undefined && count < normalizedRange.minCount) return false;
    if (normalizedRange.maxCount !== undefined && count > normalizedRange.maxCount) return false;
    return true;
  }
  if (!searchArchiveEntryCountPresets.includes(preset as SearchArchiveEntryCountPreset)) return true;
  if (preset === "under-10") return count < 10;
  if (preset === "10-100") return count >= 10 && count < 100;
  if (preset === "100-1000") return count >= 100 && count < 1_000;
  return count >= 1_000;
};
