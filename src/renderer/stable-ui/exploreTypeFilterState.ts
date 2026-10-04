import type { SearchState } from "../../shared/types";
import { clearDocumentFilters, hasDocumentFilters, retainDocumentFilters } from "./documentFilterState";
import { isDocumentOnlyExtensionSelection } from "./exploreFormatFilters";
import { clearMediaFilters, hasMediaFilters, retainApplicableMediaFilters } from "./mediaFilterState";

export const clearExploreTypeFilters = (search: SearchState) => clearDocumentFilters(clearMediaFilters(search));
export const hasExploreTypeFilters = (search: SearchState) => hasMediaFilters(search) || hasDocumentFilters(search);
export const retainApplicableExploreTypeFilters = (search: SearchState, extensions: readonly string[]) => retainDocumentFilters(
  retainApplicableMediaFilters(search, extensions),
  isDocumentOnlyExtensionSelection(extensions)
);
