import type { SearchState } from "../../shared/types";
import { clearDocumentFilters, hasDocumentFilters, retainDocumentFilters } from "./documentFilterState";
import { isArtboardDocumentOnlyExtensionSelection, isDocumentOnlyExtensionSelection } from "./exploreFormatFilters";
import { clearMediaFilters, hasMediaFilters, retainApplicableMediaFilters } from "./mediaFilterState";
import { clearTextDataFilters, hasTextDataFilters, retainApplicableTextDataFilters } from "./textDataFilterState";
import { clearArtboardFilters, hasArtboardFilters, retainArtboardFilters } from "./artboardFilterState";

export const clearExploreTypeFilters = (search: SearchState) => clearArtboardFilters(clearTextDataFilters(clearDocumentFilters(clearMediaFilters(search))));
export const hasExploreTypeFilters = (search: SearchState) => hasMediaFilters(search) || hasDocumentFilters(search) || hasTextDataFilters(search) || hasArtboardFilters(search);
export const retainApplicableExploreTypeFilters = (search: SearchState, extensions: readonly string[]) => retainApplicableTextDataFilters(
  retainArtboardFilters(retainDocumentFilters(retainApplicableMediaFilters(search, extensions), isDocumentOnlyExtensionSelection(extensions)), isArtboardDocumentOnlyExtensionSelection(extensions)),
  extensions
);
