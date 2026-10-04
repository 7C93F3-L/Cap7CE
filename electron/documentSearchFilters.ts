export const searchDocumentContentCountPresets = ["one", "2-10", "11-50", "51-100", "over-100"] as const;
export type SearchDocumentContentCountPreset = typeof searchDocumentContentCountPresets[number];
export const searchDocumentImageCompositions = ["without-images", "with-images"] as const;
export type SearchDocumentImageComposition = typeof searchDocumentImageCompositions[number];

export interface SearchDocumentContentCountRange { minCount?: number; maxCount?: number }

export const normalizeDocumentContentCountRange = (value: unknown): SearchDocumentContentCountRange | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const minCount = candidate.minCount === undefined ? undefined : Number(candidate.minCount);
  const maxCount = candidate.maxCount === undefined ? undefined : Number(candidate.maxCount);
  if (minCount !== undefined && (!Number.isSafeInteger(minCount) || minCount < 1 || minCount > 100_000)) return null;
  if (maxCount !== undefined && (!Number.isSafeInteger(maxCount) || maxCount < 1 || maxCount > 100_000)) return null;
  if (minCount === undefined && maxCount === undefined) return null;
  if (minCount !== undefined && maxCount !== undefined && minCount > maxCount) return null;
  return { ...(minCount === undefined ? {} : { minCount }), ...(maxCount === undefined ? {} : { maxCount }) };
};

export const hasDocumentSearchFacets = (search: {
  documentContentCountPreset?: unknown;
  documentContentCountRange?: unknown;
  documentImageComposition?: unknown;
}) => Boolean(search.documentContentCountPreset || search.documentContentCountRange || search.documentImageComposition);

export const matchesDocumentContentCount = (
  count: number,
  preset: unknown,
  range: unknown
) => {
  const normalizedRange = normalizeDocumentContentCountRange(range);
  if (normalizedRange) {
    if (normalizedRange.minCount !== undefined && count < normalizedRange.minCount) return false;
    if (normalizedRange.maxCount !== undefined && count > normalizedRange.maxCount) return false;
    return true;
  }
  if (!searchDocumentContentCountPresets.includes(preset as SearchDocumentContentCountPreset)) return true;
  if (preset === "one") return count === 1;
  if (preset === "2-10") return count >= 2 && count <= 10;
  if (preset === "11-50") return count >= 11 && count <= 50;
  if (preset === "51-100") return count >= 51 && count <= 100;
  return count > 100;
};

export const matchesDocumentImageComposition = (hasEmbeddedImages: boolean, composition: unknown) => (
  composition === "with-images" ? hasEmbeddedImages : composition === "without-images" ? !hasEmbeddedImages : true
);
