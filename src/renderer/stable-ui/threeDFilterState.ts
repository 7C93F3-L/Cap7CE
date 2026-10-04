import { hasThreeDSearchFacets } from "../../../electron/threeDSearchFilters";
import { supportedThreeDFactExtensions } from "../../../electron/threeDFactTypes";
import type { SearchState } from "../../shared/types";

export const clearThreeDFilters = (search: SearchState): SearchState => ({
  ...search,
  threeDModelTypes: undefined,
  threeDStructures: undefined,
  threeDTriangleCountPreset: undefined,
  threeDTriangleCountRange: undefined
});

export const retainApplicableThreeDFilters = (search: SearchState, retain: boolean, extensions: readonly string[]): SearchState => {
  if (!retain) return clearThreeDFilters(search);
  if (extensions.some((extension) => supportedThreeDFactExtensions.includes(extension as (typeof supportedThreeDFactExtensions)[number]))) return search;
  return {
    ...search,
    threeDStructures: undefined,
    threeDTriangleCountPreset: undefined,
    threeDTriangleCountRange: undefined
  };
};
export const hasThreeDFilters = (search: SearchState) => hasThreeDSearchFacets(search);
