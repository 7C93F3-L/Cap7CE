import { hasArchiveSearchFacets } from "../../../electron/archiveSearchFilters";
import { supportedArchiveFactExtensions } from "../../../electron/archiveFactTypes";
import type { SearchState } from "../../shared/types";

export const clearArchiveFilters = (search: SearchState): SearchState => ({
  ...search,
  archiveContentTypes: undefined,
  archiveEntryCountPreset: undefined,
  archiveEntryCountRange: undefined,
  archiveStructures: undefined
});

export const retainApplicableArchiveFilters = (search: SearchState, retain: boolean, extensions: readonly string[]) => (
  retain && extensions.some((extension) => supportedArchiveFactExtensions.includes(extension as (typeof supportedArchiveFactExtensions)[number]))
    ? search
    : clearArchiveFilters(search)
);

export const hasArchiveFilters = (search: SearchState) => hasArchiveSearchFacets(search);
