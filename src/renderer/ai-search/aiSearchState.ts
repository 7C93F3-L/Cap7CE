import type { ImageIndexItem, SearchState } from "../../shared/types";

const filePathKey = (filePath: string) => filePath.toLocaleLowerCase();

export const mergeAiSearchResults = (baseResults: ImageIndexItem[], preservedMatches: ImageIndexItem[]) => {
  const knownPaths = new Set(baseResults.map((item) => filePathKey(item.filePath)));
  const additions = preservedMatches.filter((item) => !knownPaths.has(filePathKey(item.filePath)));
  return additions.length > 0 ? [...baseResults, ...additions] : baseResults;
};

export const hasAiSearchScopeChanged = (previous: SearchState, next: SearchState) => (
  next.query !== previous.query
  || next.directoryId !== previous.directoryId
  || next.fileFormat !== previous.fileFormat
);
