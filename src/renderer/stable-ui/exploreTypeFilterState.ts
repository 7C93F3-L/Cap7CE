import type { SearchState } from "../../shared/types";
import { clearDocumentFilters, hasDocumentFilters, retainDocumentFilters } from "./documentFilterState";
import { isArchiveOnlyExtensionSelection, isArtboardDocumentOnlyExtensionSelection, isDocumentOnlyExtensionSelection, isFontOnlyExtensionSelection, isModelOnlyExtensionSelection, isThreeDOnlyExtensionSelection } from "./exploreFormatFilters";
import { clearMediaFilters, hasMediaFilters, retainApplicableMediaFilters } from "./mediaFilterState";
import { clearTextDataFilters, hasTextDataFilters, retainApplicableTextDataFilters } from "./textDataFilterState";
import { clearArtboardFilters, hasArtboardFilters, retainArtboardFilters } from "./artboardFilterState";
import { clearThreeDFilters, hasThreeDFilters, retainApplicableThreeDFilters } from "./threeDFilterState";
import { clearArchiveFilters, hasArchiveFilters, retainApplicableArchiveFilters } from "./archiveFilterState";
import { clearFontFilters, hasFontFilters, retainApplicableFontFilters } from "./fontFilterState";
import { clearModelFilters, hasModelFilters, retainApplicableModelFilters } from "./modelFilterState";

export const clearExploreTypeFilters = (search: SearchState) => clearModelFilters(clearFontFilters(clearArchiveFilters(clearThreeDFilters(clearArtboardFilters(clearTextDataFilters(clearDocumentFilters(clearMediaFilters(search))))))));
export const hasExploreTypeFilters = (search: SearchState) => hasMediaFilters(search) || hasDocumentFilters(search) || hasTextDataFilters(search) || hasArtboardFilters(search) || hasThreeDFilters(search) || hasArchiveFilters(search) || hasFontFilters(search) || hasModelFilters(search);
export const retainApplicableExploreTypeFilters = (search: SearchState, extensions: readonly string[]) => retainApplicableModelFilters(retainApplicableFontFilters(
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
), isModelOnlyExtensionSelection(extensions), extensions);
