import type { ComputerSearchAuthorization } from "../../electron/computerSearchTypes";

export interface CatalogKeywordSnapshot { keywords: string[]; revision: string | null; }
export interface CatalogKeywordSaveResult { saved: boolean; current: CatalogKeywordSnapshot; }
export interface CatalogKeywordSaveRequest extends ComputerSearchAuthorization { keywords: string[]; expectedRevision: string | null; }
