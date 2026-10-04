export const searchThreeDModelTypes = ["polygon", "cad", "scene"] as const;
export type SearchThreeDModelType = typeof searchThreeDModelTypes[number];

export const searchThreeDStructures = ["static", "animated", "rigged"] as const;
export type SearchThreeDStructure = typeof searchThreeDStructures[number];

export const searchThreeDTriangleCountPresets = ["under-10k", "10k-100k", "100k-1m", "over-1m"] as const;
export type SearchThreeDTriangleCountPreset = typeof searchThreeDTriangleCountPresets[number];

export interface SearchThreeDTriangleCountRange { minCount?: number; maxCount?: number }

const extensionsByModelType: Record<SearchThreeDModelType, readonly string[]> = {
  polygon: [".3ds", ".fbx", ".glb", ".gltf", ".obj", ".stl"],
  cad: [".3dm", ".dwg", ".dxf", ".iges", ".igs", ".step", ".stp"],
  scene: [".c4d", ".max", ".skp"]
};

export const normalizeThreeDTriangleCountRange = (value: unknown): SearchThreeDTriangleCountRange | null => {
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

export const hasThreeDModelTypeFacet = (search: { threeDModelTypes?: readonly unknown[] }) => Boolean(search.threeDModelTypes?.length);
export const hasThreeDMetadataFacets = (search: {
  threeDStructures?: readonly unknown[];
  threeDTriangleCountPreset?: unknown;
  threeDTriangleCountRange?: unknown;
}) => Boolean(search.threeDStructures?.length || search.threeDTriangleCountPreset || search.threeDTriangleCountRange);
export const hasThreeDSearchFacets = (search: Parameters<typeof hasThreeDModelTypeFacet>[0] & Parameters<typeof hasThreeDMetadataFacets>[0]) => (
  hasThreeDModelTypeFacet(search) || hasThreeDMetadataFacets(search)
);

export const matchesThreeDModelTypes = (extension: string, values: readonly unknown[] | undefined) => {
  const selected = [...new Set(values ?? [])].filter((value): value is SearchThreeDModelType => searchThreeDModelTypes.includes(value as SearchThreeDModelType));
  if (selected.length === 0) return true;
  const normalizedExtension = extension.trim().toLowerCase().replace(/^(?!\.)/, ".");
  return selected.some((value) => extensionsByModelType[value].includes(normalizedExtension));
};

export const matchesThreeDTriangleCount = (count: number, preset: unknown, range: unknown) => {
  const normalizedRange = normalizeThreeDTriangleCountRange(range);
  if (normalizedRange) {
    if (normalizedRange.minCount !== undefined && count < normalizedRange.minCount) return false;
    if (normalizedRange.maxCount !== undefined && count > normalizedRange.maxCount) return false;
    return true;
  }
  if (!searchThreeDTriangleCountPresets.includes(preset as SearchThreeDTriangleCountPreset)) return true;
  if (preset === "under-10k") return count < 10_000;
  if (preset === "10k-100k") return count >= 10_000 && count < 100_000;
  if (preset === "100k-1m") return count >= 100_000 && count < 1_000_000;
  return count >= 1_000_000;
};
