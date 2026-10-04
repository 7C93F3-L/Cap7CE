import type { SearchState } from "../../shared/types";

export const clearFileSizeFilter = (search: SearchState): SearchState => ({ ...search, fileSizePreset: undefined, fileSizeRange: undefined });
export const hasFileSizeFilter = (search: SearchState) => Boolean(search.fileSizePreset || search.fileSizeRange);
