import { hasArtboardSearchFacet } from "../../../electron/artboardSearchFilters";
import type { SearchState } from "../../shared/types";

export const clearArtboardFilters = (search: SearchState): SearchState => ({
  ...search,
  artboardCountPreset: undefined,
  artboardCountRange: undefined
});

export const retainArtboardFilters = (search: SearchState, retain: boolean) => retain ? search : clearArtboardFilters(search);
export const hasArtboardFilters = (search: SearchState) => hasArtboardSearchFacet(search);
