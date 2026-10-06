import type { SearchState } from "../../shared/types";
import type { ComputerSearchConditions } from "../../shared/computerSearchFactTypes";
import type { ComputerSearchModelFilter } from "../../shared/computerSearchModelTypes";
import { searchModelParameterCounts, searchModelPrecisions } from "../../../electron/modelSearchFilters";
import { toComputerSearchFontConditions } from "./computerSearchFontConditions";

const parameterRanges: Record<string, { minimum?: number; maximum?: number }> = {
  "under-1b": { minimum: 1, maximum: 999_999_999 }, "1b-3b": { minimum: 1_000_000_000, maximum: 2_999_999_999 },
  "3b-7b": { minimum: 3_000_000_000, maximum: 6_999_999_999 }, "7b-14b": { minimum: 7_000_000_000, maximum: 13_999_999_999 },
  "14b-or-more": { minimum: 14_000_000_000 }
};
export const toComputerSearchModelConditions = (search: SearchState, referenceNow = new Date()): ComputerSearchConditions => {
  const result = toComputerSearchFontConditions(search, referenceNow);
  const counts = [...new Set(search.modelParameterCounts ?? [])], precisions = [...new Set(search.modelPrecisions ?? [])];
  if (counts.some(value => !searchModelParameterCounts.some(known => known === value))
    || precisions.some(value => !searchModelPrecisions.some(known => known === value))) throw new Error("computer-search-invalid-model-selection");
  if (!counts.length && !precisions.length) return result;
  if (result.facts) throw new Error("computer-search-mixed-media-conditions");
  const model: ComputerSearchModelFilter = {};
  if (counts.length) model.parameterRanges = counts.map(value => ({ ...parameterRanges[value] }));
  if (precisions.length) model.precisions = precisions;
  return { ...result, facts: { kind: "model", model } };
};
