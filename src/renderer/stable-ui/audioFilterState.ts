import { hasAudioSearchFacets } from "../../../electron/audioSearchFilters";
import type { SearchState } from "../../shared/types";

export const clearAudioFilters = (search: SearchState): SearchState => ({
  ...search,
  audioDurationPreset: undefined,
  audioDurationRange: undefined,
  audioChannels: undefined
});

export const retainAudioFilters = (search: SearchState, retain: boolean): SearchState => retain ? search : clearAudioFilters(search);
export const hasAudioFilters = (search: SearchState) => hasAudioSearchFacets(search);
