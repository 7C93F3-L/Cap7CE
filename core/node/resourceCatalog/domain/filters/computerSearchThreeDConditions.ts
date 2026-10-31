import type { SearchState } from "../../../../../core/shared/types";
import type { ComputerSearchConditions } from "../../../../../core/shared/computerSearchFactTypes";
import type { ComputerSearchThreeDFilter } from "../../../../../core/shared/computerSearchThreeDTypes";
import { getThreeDModelTypeExtensions, normalizeThreeDTriangleCountRange, searchThreeDModelTypes, searchThreeDStructures, searchThreeDTriangleCountPresets } from "../formats/threeDSearchFilters";
import { toComputerSearchDocumentConditions } from "./computerSearchDocumentConditions";
const counts: Record<string, [number, number?]> = {
  "under-10k": [0, 9_999], "10k-100k": [10_000, 99_999], "100k-1m": [100_000, 999_999], "over-1m": [1_000_000]
};
const invalid = (): never => { throw new Error("computer-search-invalid-three-d-selection"); };
export const toComputerSearchThreeDConditions = (search: SearchState, referenceNow = new Date()): ComputerSearchConditions => {
  let result = toComputerSearchDocumentConditions(search, referenceNow);
  const types = [...new Set(search.threeDModelTypes ?? [])], structures = [...new Set(search.threeDStructures ?? [])];
  if (types.some(value => !searchThreeDModelTypes.some(known => known === value))
    || structures.some(value => !searchThreeDStructures.some(known => known === value))) return invalid();
  if (types.length) {
    const selected = getThreeDModelTypeExtensions(types), existing = result.fileConditions?.extensions;
    result = { ...result, fileConditions: { ...result.fileConditions, extensions: existing ? existing.filter(value => selected.includes(value)) : selected } };
  }
  const threeD: ComputerSearchThreeDFilter = {};
  if (search.threeDTriangleCountPreset !== undefined && !searchThreeDTriangleCountPresets.some(value => value === search.threeDTriangleCountPreset)) return invalid();
  if (search.threeDTriangleCountRange !== undefined) {
    const input = search.threeDTriangleCountRange;
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["minCount", "maxCount"].includes(key))
      || [input.minCount, input.maxCount].some(value => value !== undefined && !Number.isSafeInteger(value))) return invalid();
    const range = normalizeThreeDTriangleCountRange(input); if (!range) return invalid();
    if (range.minCount !== undefined) threeD.minimumTriangleCount = range.minCount;
    if (range.maxCount !== undefined) threeD.maximumTriangleCount = range.maxCount;
  } else if (search.threeDTriangleCountPreset) {
    const [min, max] = counts[search.threeDTriangleCountPreset]; threeD.minimumTriangleCount = min;
    if (max !== undefined) threeD.maximumTriangleCount = max;
  }
  if (structures.length) threeD.structures = structures;
  if (!Object.keys(threeD).length) return result;
  if (result.facts) throw new Error("computer-search-mixed-media-conditions");
  return { ...result, facts: { kind: "three-d", threeD } };
};
