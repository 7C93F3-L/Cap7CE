import type { SearchState } from "../../shared/types";
import { clearDocumentFilters, hasDocumentFilters, retainDocumentFilters } from "./documentFilterState";
import { isDocumentOnlyExtensionSelection } from "./exploreFormatFilters";
import { clearMediaFilters, hasMediaFilters, retainApplicableMediaFilters } from "./mediaFilterState";
import { clearTextDataFilters, hasTextDataFilters, retainApplicableTextDataFilters } from "./textDataFilterState";

export const clearExploreTypeFilters = (search: SearchState) => clearTextDataFilters(clearDocumentFilters(clearMediaFilters(search)));
export const hasExploreTypeFilters = (search: SearchState) => hasMediaFilters(search) || hasDocumentFilters(search) || hasTextDataFilters(search);
export const retainApplicableExploreTypeFilters = (search: SearchState, extensions: readonly string[]) => retainApplicableTextDataFilters(
  retainDocumentFilters(retainApplicableMediaFilters(search, extensions), isDocumentOnlyExtensionSelection(extensions)),
  extensions
);
