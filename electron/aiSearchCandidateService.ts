import type { PersistedDirectory } from "./directoryStore";
import { planSearchQuery, type NaturalSearchCondition, type SearchQueryPlan } from "./searchQueryPlanner";
import { searchIndexedCatalog, type ImageSearchResult, type ImageSearchState } from "./sqliteImageIndex";

const hardConditionTypes = new Set<NaturalSearchCondition["type"]>([
  "fileKind",
  "modifiedTime",
  "orientation",
  "aspectRatio",
  "animation"
]);
const hardConditionSentinel = "__cap7ce_ai_hard_condition__";

export interface AiSearchCandidatePlan {
  hardQueryPlan: SearchQueryPlan;
  visualTerms: string[];
}

export const createAiSearchCandidatePlan = (query: string, referenceNow = new Date()): AiSearchCandidatePlan => {
  const queryPlan = planSearchQuery(query, referenceNow);
  const hardTerms = queryPlan.terms.flatMap((plannedTerm) => {
    const conditions = plannedTerm.conditions.filter((condition) => hardConditionTypes.has(condition.type));
    return conditions.length > 0 ? [{ term: hardConditionSentinel, conditions }] : [];
  });
  const visualTerms = queryPlan.terms
    .filter((plannedTerm) => (
      plannedTerm.conditions.length === 0
      || plannedTerm.conditions.some((condition) => !hardConditionTypes.has(condition.type))
    ))
    .map((plannedTerm) => plannedTerm.term);
  return {
    hardQueryPlan: { terms: hardTerms },
    visualTerms: [...new Set(visualTerms)]
  };
};

export interface AiSearchCandidateResult {
  candidates: ImageSearchResult[];
  visualTerms: string[];
}

export const listAiSearchCandidates = async (
  search: ImageSearchState,
  directories: PersistedDirectory[],
  excludedFilePaths: readonly string[]
): Promise<AiSearchCandidateResult> => {
  const plan = createAiSearchCandidatePlan(search.query);
  if (plan.visualTerms.length === 0) return { candidates: [], visualTerms: [] };
  const indexed = await searchIndexedCatalog(search, directories, plan.hardQueryPlan);
  const excluded = new Set(excludedFilePaths.map((filePath) => filePath.toLocaleLowerCase()));
  return {
    visualTerms: plan.visualTerms,
    candidates: indexed.images.filter((candidate) => (
      candidate.resultKind === "visual"
      && !excluded.has(candidate.filePath.toLocaleLowerCase())
    ))
  };
};
