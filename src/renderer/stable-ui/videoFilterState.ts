import { hasVideoSearchFacets } from "../../../electron/videoSearchFilters";
import type { SearchState } from "../../shared/types";

export const clearVideoFilters = (search: SearchState): SearchState => ({
  ...search,
  videoDurationPreset: undefined,
  videoDurationRange: undefined,
  videoAspectRatios: undefined,
  videoAspectRatioValues: undefined,
  videoResolutions: undefined,
  videoDimensionFilter: undefined,
  videoVisualColors: undefined,
  videoColorTraits: undefined
});

export const retainVideoFilters = (search: SearchState, retain: boolean): SearchState => retain ? search : clearVideoFilters(search);
export const hasVideoFilters = (search: SearchState) => hasVideoSearchFacets(search);
