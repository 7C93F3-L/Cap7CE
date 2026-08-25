import {
  SEARCH_EVIDENCE_SOURCE_RANK,
  type SearchResultEvidence
} from "./searchEvidenceTypes";

export type SearchRankingStrategy = "weakest-required" | "evidence-vector";

const bestSourceRanks = (evidence: SearchResultEvidence) => evidence.terms
  .map((term) => SEARCH_EVIDENCE_SOURCE_RANK[term.bestSource])
  .sort((left, right) => right - left);

export const compareSearchEvidence = (
  left: SearchResultEvidence,
  right: SearchResultEvidence,
  strategy: SearchRankingStrategy
) => {
  const leftRanks = bestSourceRanks(left);
  const rightRanks = bestSourceRanks(right);
  const weakestDifference = leftRanks[0] - rightRanks[0];
  if (weakestDifference !== 0 || strategy === "weakest-required") return weakestDifference;

  const length = Math.max(leftRanks.length, rightRanks.length);
  for (let index = 1; index < length; index += 1) {
    const difference = (leftRanks[index] ?? Number.MAX_SAFE_INTEGER)
      - (rightRanks[index] ?? Number.MAX_SAFE_INTEGER);
    if (difference !== 0) return difference;
  }
  return 0;
};
