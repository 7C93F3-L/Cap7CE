export const normalizeKeyword = (keyword: string) => keyword.trim().replace(/\s+/g, " ");

export const normalizeKeywordList = (keywords: string[]) => {
  const normalizedKeywords: string[] = [];
  const seen = new Set<string>();

  for (const keyword of keywords) {
    if (typeof keyword !== "string") continue;
    const normalizedKeyword = normalizeKeyword(keyword);
    if (!normalizedKeyword || seen.has(normalizedKeyword)) continue;
    seen.add(normalizedKeyword);
    normalizedKeywords.push(normalizedKeyword);
  }

  return normalizedKeywords;
};

export const parseKeywordText = (keywordText: string) => normalizeKeywordList(
  keywordText.replace(/，/g, ",").split(",")
);

export const formatKeywordText = (keywords: string[]) => normalizeKeywordList(keywords).join(",");

export const applyKeywordBatchDelta = (
  existingKeywords: string[],
  initialCommonKeywords: string[],
  targetKeywords: string[]
) => {
  const normalizedExistingKeywords = normalizeKeywordList(existingKeywords);
  const normalizedInitialKeywords = normalizeKeywordList(initialCommonKeywords);
  const normalizedTargetKeywords = normalizeKeywordList(targetKeywords);
  const initialKeywordSet = new Set(normalizedInitialKeywords);
  const targetKeywordSet = new Set(normalizedTargetKeywords);
  const removedKeywordSet = new Set(
    normalizedInitialKeywords.filter((keyword) => !targetKeywordSet.has(keyword))
  );
  const addedKeywords = normalizedTargetKeywords.filter((keyword) => !initialKeywordSet.has(keyword));
  const nextKeywords = normalizedExistingKeywords.filter((keyword) => !removedKeywordSet.has(keyword));
  const nextKeywordSet = new Set(nextKeywords);

  for (const keyword of addedKeywords) {
    if (nextKeywordSet.has(keyword)) continue;
    nextKeywordSet.add(keyword);
    nextKeywords.push(keyword);
  }

  return nextKeywords;
};
