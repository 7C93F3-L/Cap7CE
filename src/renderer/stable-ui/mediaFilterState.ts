import type { SearchState } from "../../shared/types";
import { clearAudioFilters, hasAudioFilters, retainAudioFilters } from "./audioFilterState";
import { isAudioOnlyExtensionSelection, isImageOnlyExtensionSelection, isVideoOnlyExtensionSelection } from "./exploreFormatFilters";
import { clearImageFilters, hasImageFilters, retainImageFilters } from "./imageFilterState";
import { clearVideoFilters, hasVideoFilters, retainVideoFilters } from "./videoFilterState";

export const clearMediaFilters = (search: SearchState) => clearAudioFilters(clearVideoFilters(clearImageFilters(search)));

export const hasMediaFilters = (search: SearchState) => hasImageFilters(search) || hasVideoFilters(search) || hasAudioFilters(search);

export const retainApplicableMediaFilters = (search: SearchState, extensions: readonly string[]) => retainAudioFilters(
  retainVideoFilters(
    retainImageFilters(search, isImageOnlyExtensionSelection(extensions)),
    isVideoOnlyExtensionSelection(extensions)
  ),
  isAudioOnlyExtensionSelection(extensions)
);
