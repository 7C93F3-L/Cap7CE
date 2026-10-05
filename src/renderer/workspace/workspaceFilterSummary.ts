import type { SearchState } from "../../shared/types";
import { hasExploreTypeFilters } from "../stable-ui/exploreTypeFilterState";
import { hasFileSizeFilter } from "../stable-ui/fileSizeFilterState";

export const workspaceFilterCount = (search: SearchState) => Number(search.fileFormat !== "all" || Boolean(search.selectedExtensions?.length))
  + Number((search.timePreset ?? "all") !== "all" || Boolean(search.modifiedTimeRange))
  + Number(hasFileSizeFilter(search)) + Number(hasExploreTypeFilters(search));
