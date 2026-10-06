import type { ComputerSearchModelFilter } from "../src/shared/computerSearchModelTypes";
import { searchModelPrecisions } from "./modelSearchFilters";
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const invalid = (): never => { throw new Error("computer-search-invalid-facts"); };
export const readComputerSearchModel = (value: unknown): ComputerSearchModelFilter => {
  if (!object(value) || Object.keys(value).some(key => !["parameterRanges", "precisions"].includes(key))) return invalid();
  const model: ComputerSearchModelFilter = {};
  if (value.precisions !== undefined) {
    if (!Array.isArray(value.precisions) || value.precisions.length < 1 || value.precisions.length > 7
      || value.precisions.some(item => !searchModelPrecisions.some(known => known === item))) return invalid();
    model.precisions = [...value.precisions];
  }
  if (value.parameterRanges !== undefined) {
    if (!Array.isArray(value.parameterRanges) || value.parameterRanges.length < 1 || value.parameterRanges.length > 5) return invalid();
    model.parameterRanges = value.parameterRanges.map(input => {
      if (!object(input) || Object.keys(input).some(key => !["minimum", "maximum"].includes(key))
        || input.minimum === undefined && input.maximum === undefined) return invalid();
      const range: { minimum?: number; maximum?: number } = {};
      for (const key of ["minimum", "maximum"] as const) if (input[key] !== undefined) {
        if (!Number.isSafeInteger(input[key]) || Number(input[key]) < 1) return invalid();
        range[key] = input[key] as number;
      }
      if (range.minimum !== undefined && range.maximum !== undefined && range.minimum > range.maximum) return invalid();
      return range;
    });
  }
  return model;
};
