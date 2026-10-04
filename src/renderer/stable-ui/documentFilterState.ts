import { hasDocumentSearchFacets } from "../../../electron/documentSearchFilters";
import type { SearchState } from "../../shared/types";

export const clearDocumentFilters = (search: SearchState): SearchState => ({
  ...search,
  documentContentCountPreset: undefined,
  documentContentCountRange: undefined
});

export const retainDocumentFilters = (search: SearchState, retain: boolean): SearchState => retain ? search : clearDocumentFilters(search);
export const hasDocumentFilters = (search: SearchState) => hasDocumentSearchFacets(search);
