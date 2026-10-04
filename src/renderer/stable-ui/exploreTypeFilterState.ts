import type { SearchState } from "../../shared/types";
import { clearDocumentFilters, hasDocumentFilters, retainDocumentFilters } from "./documentFilterState";
import { isArchiveOnlyExtensionSelection, isArtboardDocumentOnlyExtensionSelection, isDocumentOnlyExtensionSelection, isFontOnlyExtensionSelection, isThreeDOnlyExtensionSelection } from "./exploreFormatFilters";
import { clearMediaFilters, hasMediaFilters, retainApplicableMediaFilters } from "./mediaFilterState";
import { clearTextDataFilters, hasTextDataFilters, retainApplicableTextDataFilters } from "./textDataFilterState";
import { clearArtboardFilters, hasArtboardFilters, retainArtboardFilters } from "./artboardFilterState";
import { clearThreeDFilters, hasThreeDFilters, retainApplicableThreeDFilters } from "./threeDFilterState";
import { clearArchiveFilters, hasArchiveFilters, retainApplicableArchiveFilters } from "./archiveFilterState";
import { clearFontFilters, hasFontFilters, retainApplicableFontFilters } from "./fontFilterState";

export const clearExploreTypeFilters = (search: SearchState) => clearFontFilters(clearArchiveFilters(clearThreeDFilters(clearArtboardFilters(clearTextDataFilters(clearDocumentFilters(clearMediaFilters(search)))))));
export const hasExploreTypeFilters = (search: SearchState) => hasMediaFilters(search) || hasDocumentFilters(search) || hasTextDataFilters(search) || hasArtboardFilters(search) || hasThreeDFilters(search) || hasArchiveFilters(search) || hasFontFilters(search);
export const retainApplicableExploreTypeFilters = (search: SearchState, extensions: readonly string[]) => retainApplicableFontFilters(
  retainApplicableArchiveFilters(
    retainApplicableThreeDFilters(
      retainApplicableTextDataFilters(
        retainArtboardFilters(retainDocumentFilters(retainApplicableMediaFilters(search, extensions), isDocumentOnlyExtensionSelection(extensions)), isArtboardDocumentOnlyExtensionSelection(extensions)),
        extensions
      ),
      isThreeDOnlyExtensionSelection(extensions),
      extensions
    ),
    isArchiveOnlyExtensionSelection(extensions),
    extensions
  ),
  isFontOnlyExtensionSelection(extensions),
  extensions
);
