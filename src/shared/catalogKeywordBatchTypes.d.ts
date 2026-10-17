import type { ComputerSearchAuthorizationBatch } from "../../electron/computerSearchTypes";
import type { CatalogAutoKeywordPhase } from "./catalogAutoKeywordTypes";

export type CatalogKeywordBatchSource = ComputerSearchAuthorizationBatch | { favoriteId: string } | { locationId: string } | { driveLetter: string };
export type CatalogKeywordBatchRequest = CatalogKeywordBatchSource & { requestId: string };
export interface CatalogKeywordBatchCounts { total: number; processed: number; succeeded: number; failed: number; skipped: number; }
export interface CatalogKeywordBatchProgress extends CatalogKeywordBatchCounts {
  requestId: string; phase: CatalogAutoKeywordPhase | "collecting"; name: string;
}
export interface CatalogKeywordBatchResult extends CatalogKeywordBatchCounts {
  status: "completed" | "cancelled" | "failed"; message?: string;
}
