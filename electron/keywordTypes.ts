export interface KeywordBatchUpdateTarget {
  filePath: string;
}

export interface KeywordBatchUpdateRequest {
  targets: KeywordBatchUpdateTarget[];
  initialCommonKeywords: string[];
  targetKeywordText: string;
}

export interface KeywordBatchUpdateResult {
  success: boolean;
  totalCount: number;
  failedCount: number;
  errorMessage: string;
  normalizedKeywordText: string;
}
