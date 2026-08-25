export const SEARCH_EVIDENCE_SOURCE_ORDER = [
  "userKeyword",
  "userDescription",
  "fileName",
  "fileExtension",
  "fileCategory",
  "modifiedTime",
  "imageOrientation",
  "imageAspectRatio",
  "visualPropertyStrong",
  "relativeDirectory",
  "rootDirectoryName",
  "directoryDisplayName",
  "embeddedMetadata",
  "visualPropertySoft",
  "aiKeyword",
  "aiCaption",
  "aiSearch"
] as const;

export type SearchEvidenceSource = typeof SEARCH_EVIDENCE_SOURCE_ORDER[number];

export type SearchEvidenceClass =
  | "userMetadata"
  | "fileName"
  | "fileFormat"
  | "naturalCondition"
  | "directoryPath"
  | "embeddedMetadata"
  | "aiMetadata"
  | "visualSimilarity"
  | "aiDeepMatch";

export interface EmbeddedMetadataMatchSnippet {
  term: string;
  kind: string;
  snippet: string;
}

export interface SearchTermEvidence {
  term: string;
  sources: SearchEvidenceSource[];
  bestSource: SearchEvidenceSource;
}

export interface SearchResultEvidence {
  terms: SearchTermEvidence[];
  classification: SearchEvidenceClass;
  weakestSource: SearchEvidenceSource;
  policy: "weakest-required-vector-v1" | "ai-search-beta-v1" | "ai-search-cascade-v1";
  embeddedMatches: EmbeddedMetadataMatchSnippet[];
}

export const SEARCH_EVIDENCE_SOURCE_RANK = Object.fromEntries(
  SEARCH_EVIDENCE_SOURCE_ORDER.map((source, index) => [source, index])
) as Record<SearchEvidenceSource, number>;

export const SEARCH_EVIDENCE_SOURCE_CLASS: Record<SearchEvidenceSource, SearchEvidenceClass> = {
  userKeyword: "userMetadata",
  userDescription: "userMetadata",
  fileName: "fileName",
  fileExtension: "fileFormat",
  fileCategory: "naturalCondition",
  modifiedTime: "naturalCondition",
  imageOrientation: "naturalCondition",
  imageAspectRatio: "naturalCondition",
  visualPropertyStrong: "naturalCondition",
  relativeDirectory: "directoryPath",
  rootDirectoryName: "directoryPath",
  directoryDisplayName: "directoryPath",
  embeddedMetadata: "embeddedMetadata",
  aiKeyword: "aiMetadata",
  aiCaption: "aiMetadata",
  visualPropertySoft: "visualSimilarity",
  aiSearch: "aiDeepMatch"
};
