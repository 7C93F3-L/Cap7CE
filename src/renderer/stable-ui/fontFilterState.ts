import { hasFontSearchFacets } from "../../../electron/fontSearchFilters";
import { supportedFontFactExtensions } from "../../../electron/fontFactTypes";
import type { SearchState } from "../../shared/types";

export const clearFontFilters = (search: SearchState): SearchState => ({
  ...search,
  fontWeights: undefined,
  fontStyles: undefined,
  fontCharacterSets: undefined,
  fontKinds: undefined
});
export const retainApplicableFontFilters = (search: SearchState, retain: boolean, extensions: readonly string[]) => (
  retain && extensions.some((extension) => supportedFontFactExtensions.includes(extension as (typeof supportedFontFactExtensions)[number]))
    ? search
    : clearFontFilters(search)
);
export const hasFontFilters = (search: SearchState) => hasFontSearchFacets(search);
