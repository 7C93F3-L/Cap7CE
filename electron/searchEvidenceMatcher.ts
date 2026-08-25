import path from "node:path";
import { getRelativeDirectoryEvidence, normalizeSearchEvidence } from "./searchPathEvidence";
import {
  matchesNaturalSearchCondition,
  planSearchQuery,
  type PlannedSearchTerm,
  type SearchQueryPlan
} from "./searchQueryPlanner";
import {
  SEARCH_EVIDENCE_SOURCE_CLASS,
  SEARCH_EVIDENCE_SOURCE_ORDER,
  SEARCH_EVIDENCE_SOURCE_RANK,
  type SearchEvidenceSource,
  type SearchResultEvidence,
  type SearchTermEvidence
} from "./searchEvidenceTypes";
import type { EmbeddedSearchEvidence } from "./embeddedMetadataTypes";
import type { VisualPropertyVector } from "./visualPropertyTypes";

export interface SearchEvidenceCandidate {
  filePath: string;
  fileName: string;
  extension: string;
  directoryPath: string;
  directoryName: string;
  keywords: string[];
  userDescription: string;
  aiKeywords: string[];
  caption: string;
  embeddedEvidence?: EmbeddedSearchEvidence[];
  modifiedAt?: string;
  imageWidth?: number;
  imageHeight?: number;
  visualProperties?: VisualPropertyVector | null;
  isAnimated?: boolean;
}

const includesTerm = (value: string, term: string) => normalizeSearchEvidence(value).includes(term);

const keywordMatchesTerm = (keywords: string[], term: string) => keywords.some(
  (keyword) => normalizeSearchEvidence(keyword.trim()) === term
);

const fileNameMatchesTerm = (candidate: SearchEvidenceCandidate, term: string) => {
  const normalizedFileName = normalizeSearchEvidence(candidate.fileName);
  const normalizedExtension = normalizeSearchEvidence(candidate.extension);
  const extensionLength = normalizedExtension && normalizedFileName.endsWith(normalizedExtension)
    ? normalizedExtension.length
    : 0;
  const fileNameStem = extensionLength > 0
    ? normalizedFileName.slice(0, -extensionLength)
    : normalizedFileName;
  return fileNameStem.includes(term)
    || (normalizedFileName.includes(term) && !normalizedExtension.includes(term));
};

export const getSearchTermEvidenceSources = (
  candidate: SearchEvidenceCandidate,
  term: string,
  plannedTerm?: PlannedSearchTerm
): SearchEvidenceSource[] => {
  const sources = new Set<SearchEvidenceSource>();
  const normalizedExtension = normalizeSearchEvidence(candidate.extension);
  const relativeDirectory = candidate.directoryPath
    ? getRelativeDirectoryEvidence(candidate.directoryPath, candidate.filePath) ?? ""
    : "";
  const rootDirectoryName = candidate.directoryPath
    ? path.basename(path.resolve(candidate.directoryPath)) || candidate.directoryPath
    : "";

  if (keywordMatchesTerm(candidate.keywords, term)) sources.add("userKeyword");
  if (includesTerm(candidate.userDescription, term)) sources.add("userDescription");
  if (fileNameMatchesTerm(candidate, term)) sources.add("fileName");
  if (normalizedExtension.includes(term)) sources.add("fileExtension");
  for (const condition of plannedTerm?.conditions ?? []) {
    if (!matchesNaturalSearchCondition(candidate, condition)) continue;
    if (condition.type === "fileKind") sources.add("fileCategory");
    if (condition.type === "modifiedTime") sources.add("modifiedTime");
    if (condition.type === "orientation") sources.add("imageOrientation");
    if (condition.type === "aspectRatio") sources.add("imageAspectRatio");
    if (condition.type === "visualProperty") {
      sources.add(condition.strength === "strong" ? "visualPropertyStrong" : "visualPropertySoft");
    }
    if (condition.type === "animation") sources.add("fileCategory");
  }
  if (includesTerm(relativeDirectory, term)) sources.add("relativeDirectory");
  if (includesTerm(rootDirectoryName, term)) sources.add("rootDirectoryName");
  if (includesTerm(candidate.directoryName, term)) sources.add("directoryDisplayName");
  if (candidate.embeddedEvidence?.some((item) => includesTerm(item.searchText, term))) {
    sources.add("embeddedMetadata");
  }
  if (keywordMatchesTerm(candidate.aiKeywords, term)) sources.add("aiKeyword");
  if (includesTerm(candidate.caption, term)) sources.add("aiCaption");

  return SEARCH_EVIDENCE_SOURCE_ORDER.filter((source) => sources.has(source));
};

export const getSearchResultEvidence = (
  candidate: SearchEvidenceCandidate,
  query: string,
  queryPlan: SearchQueryPlan = planSearchQuery(query)
): SearchResultEvidence | null => {
  if (queryPlan.terms.length === 0) return null;

  const termEvidence: SearchTermEvidence[] = [];
  const embeddedMatches: SearchResultEvidence["embeddedMatches"] = [];
  for (const plannedTerm of queryPlan.terms) {
    const { term } = plannedTerm;
    const sources = getSearchTermEvidenceSources(candidate, term, plannedTerm);
    const bestSource = sources[0];
    if (!bestSource) return null;
    termEvidence.push({ term, sources, bestSource });
    const embeddedMatch = candidate.embeddedEvidence?.find((item) => includesTerm(item.searchText, term));
    if (embeddedMatch && embeddedMatches.length < 8) {
      const normalizedText = normalizeSearchEvidence(embeddedMatch.searchText);
      const matchIndex = normalizedText.indexOf(term);
      const start = Math.max(0, matchIndex - 48);
      const end = Math.min(embeddedMatch.searchText.length, start + 176);
      embeddedMatches.push({
        term,
        kind: embeddedMatch.kind,
        snippet: `${start > 0 ? "…" : ""}${embeddedMatch.searchText.slice(start, end)}${end < embeddedMatch.searchText.length ? "…" : ""}`.slice(0, 180)
      });
    }
  }

  const weakestSource = termEvidence.reduce((weakest, evidence) => (
    SEARCH_EVIDENCE_SOURCE_RANK[evidence.bestSource] > SEARCH_EVIDENCE_SOURCE_RANK[weakest]
      ? evidence.bestSource
      : weakest
  ), termEvidence[0].bestSource);

  return {
    terms: termEvidence,
    classification: SEARCH_EVIDENCE_SOURCE_CLASS[weakestSource],
    weakestSource,
    policy: "weakest-required-vector-v1",
    embeddedMatches
  };
};
