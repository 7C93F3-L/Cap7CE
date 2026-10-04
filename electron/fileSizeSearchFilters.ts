export const searchFileSizePresets = ["under-1mb", "1mb-10mb", "10mb-100mb", "100mb-1gb", "1gb-or-more"] as const;
export type SearchFileSizePreset = typeof searchFileSizePresets[number];

export interface SearchFileSizeRange { minBytes?: number; maxBytes?: number }
export interface ResolvedFileSizeFilter extends SearchFileSizeRange { maximumInclusive: boolean }

export const kibibyte = 1024;
export const mebibyte = 1024 * kibibyte;
export const gibibyte = 1024 * mebibyte;
const maximumFileSize = Number.MAX_SAFE_INTEGER;

const presetRanges: Record<SearchFileSizePreset, ResolvedFileSizeFilter> = {
  "under-1mb": { maxBytes: mebibyte, maximumInclusive: false },
  "1mb-10mb": { minBytes: mebibyte, maxBytes: 10 * mebibyte, maximumInclusive: false },
  "10mb-100mb": { minBytes: 10 * mebibyte, maxBytes: 100 * mebibyte, maximumInclusive: false },
  "100mb-1gb": { minBytes: 100 * mebibyte, maxBytes: gibibyte, maximumInclusive: false },
  "1gb-or-more": { minBytes: gibibyte, maximumInclusive: false }
};

export const normalizeFileSizeRange = (value: unknown): SearchFileSizeRange | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const minBytes = candidate.minBytes === undefined ? undefined : Number(candidate.minBytes);
  const maxBytes = candidate.maxBytes === undefined ? undefined : Number(candidate.maxBytes);
  if (minBytes !== undefined && (!Number.isSafeInteger(minBytes) || minBytes < 0 || minBytes > maximumFileSize)) return null;
  if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > maximumFileSize)) return null;
  if (minBytes === undefined && maxBytes === undefined) return null;
  if (minBytes !== undefined && maxBytes !== undefined && minBytes > maxBytes) return null;
  return { ...(minBytes === undefined ? {} : { minBytes }), ...(maxBytes === undefined ? {} : { maxBytes }) };
};

export const resolveSearchFileSizeFilter = (preset: unknown, range: unknown): ResolvedFileSizeFilter | null => {
  const normalizedRange = normalizeFileSizeRange(range);
  if (normalizedRange) return { ...normalizedRange, maximumInclusive: true };
  return searchFileSizePresets.includes(preset as SearchFileSizePreset) ? presetRanges[preset as SearchFileSizePreset] : null;
};

export const matchesSearchFileSize = (fileSize: number, preset: unknown, range: unknown) => {
  const filter = resolveSearchFileSizeFilter(preset, range);
  if (!filter) return true;
  if (filter.minBytes !== undefined && fileSize < filter.minBytes) return false;
  if (filter.maxBytes !== undefined && (filter.maximumInclusive ? fileSize > filter.maxBytes : fileSize >= filter.maxBytes)) return false;
  return true;
};
