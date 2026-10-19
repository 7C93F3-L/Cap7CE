export interface LocalKeywordModelConnection { baseUrl: string; modelName: string }
export interface KeywordSourceIdentity {
  path: string;
  fileReference: string;
  createdUtcTicks: number | null;
  createdFileTimeMilliseconds: string | null;
}
