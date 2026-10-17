import type { ComputerSearchAuthorization } from "../../electron/computerSearchTypes";
import type { CatalogKeywordSnapshot } from "./catalogKeywordTypes";

export type CatalogAutoKeywordPhase = "preparing" | "starting" | "generating" | "saving";
export interface CatalogAutoKeywordRequest extends ComputerSearchAuthorization { requestId: string; }
export interface CatalogAutoKeywordProgress { requestId: string; phase: CatalogAutoKeywordPhase; }
export type CatalogAutoKeywordResult = { status: "saved"; current: CatalogKeywordSnapshot; added: number }
  | { status: "cancelled" } | { status: "failed"; message: string; fatal?: boolean };
