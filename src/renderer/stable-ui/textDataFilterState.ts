import { hasTextDataSearchFacets } from "../../../electron/textDataSearchFilters";
import type { SearchState } from "../../shared/types";
import { isCsvOnlyExtensionSelection, isJsonOnlyExtensionSelection, isTextOnlyExtensionSelection } from "./exploreFormatFilters";

export const clearTextFilters = (search: SearchState): SearchState => ({
  ...search,
  textCharacterCountPreset: undefined,
  textCharacterCountRange: undefined,
  textLineCountPreset: undefined,
  textLineCountRange: undefined
});
export const clearCsvFilters = (search: SearchState): SearchState => ({
  ...search,
  csvRecordCountPreset: undefined,
  csvRecordCountRange: undefined,
  csvColumnCountPreset: undefined,
  csvColumnCountRange: undefined
});
export const clearJsonFilters = (search: SearchState): SearchState => ({
  ...search,
  jsonItemCountPreset: undefined,
  jsonItemCountRange: undefined,
  jsonRootKind: undefined
});
export const clearTextDataFilters = (search: SearchState) => clearJsonFilters(clearCsvFilters(clearTextFilters(search)));
export const hasTextDataFilters = (search: SearchState) => hasTextDataSearchFacets(search);
export const retainApplicableTextDataFilters = (search: SearchState, extensions: readonly string[]) => {
  if (isTextOnlyExtensionSelection(extensions)) return clearJsonFilters(clearCsvFilters(search));
  if (isCsvOnlyExtensionSelection(extensions)) return clearJsonFilters(clearTextFilters(search));
  if (isJsonOnlyExtensionSelection(extensions)) return clearCsvFilters(clearTextFilters(search));
  return clearTextDataFilters(search);
};
