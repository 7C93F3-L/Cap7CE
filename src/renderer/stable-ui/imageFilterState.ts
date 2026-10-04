import { hasImageSearchFacets } from "../../../electron/imageSearchFilters";
import type { SearchState } from "../../shared/types";

export const clearImageFilters = (search: SearchState): SearchState => ({
  ...search,
  visualColors: undefined,
  imageColorTraits: undefined,
  imageAspectRatios: undefined,
  imageAspectRatioValues: undefined,
  imageDimensionFilter: undefined,
  imageAnimation: undefined
});

export const retainImageFilters = (search: SearchState, retain: boolean): SearchState => retain ? search : clearImageFilters(search);
export const hasImageFilters = (search: SearchState) => hasImageSearchFacets(search);
