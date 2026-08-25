import type { ImageIndexItem } from "../../shared/types";

export const getCommonKeywords = (items: ImageIndexItem[]) => {
  if (items.length === 0) return [];
  const firstKeywords = items[0].keywords.filter((keyword, index, keywords) => keywords.indexOf(keyword) === index);
  const remainingKeywordSets = items.slice(1).map((item) => new Set(item.keywords));
  return firstKeywords.filter((keyword) => remainingKeywordSets.every((keywords) => keywords.has(keyword)));
};
