import { hasModelSearchFacets } from "../../../electron/modelSearchFilters";
import { supportedModelFactExtensions } from "../../../electron/modelFactTypes";
import type { SearchState } from "../../shared/types";

export const clearModelFilters = (search: SearchState): SearchState => ({
  ...search,
  modelParameterCounts: undefined,
  modelPrecisions: undefined
});
export const retainApplicableModelFilters = (search: SearchState, retain: boolean, extensions: readonly string[]) => (
  retain && extensions.some((extension) => supportedModelFactExtensions.includes(extension as (typeof supportedModelFactExtensions)[number]))
    ? search
    : clearModelFilters(search)
);
export const hasModelFilters = (search: SearchState) => hasModelSearchFacets(search);
