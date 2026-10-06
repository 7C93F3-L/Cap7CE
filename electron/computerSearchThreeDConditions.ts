import type { ComputerSearchThreeDFilter } from "../src/shared/computerSearchThreeDTypes";
import { searchThreeDStructures } from "./threeDSearchFilters";
const invalid = (): never => { throw new Error("computer-search-invalid-facts"); };
export const readComputerSearchThreeD = (value: unknown): ComputerSearchThreeDFilter => {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !["minimumTriangleCount", "maximumTriangleCount", "structures"].includes(key))) return invalid();
  const input = value as Record<string, unknown>, result: ComputerSearchThreeDFilter = {};
  for (const key of ["minimumTriangleCount", "maximumTriangleCount"] as const) if (input[key] !== undefined) {
    if (!Number.isSafeInteger(input[key]) || Number(input[key]) < 0 || Number(input[key]) > 2_000_000_000) return invalid();
    result[key] = input[key] as number;
  }
  if (result.minimumTriangleCount !== undefined && result.maximumTriangleCount !== undefined && result.minimumTriangleCount > result.maximumTriangleCount) return invalid();
  if (input.structures !== undefined) {
    if (!Array.isArray(input.structures) || input.structures.length < 1 || input.structures.length > 3
      || input.structures.some(value => !searchThreeDStructures.some(known => known === value))) return invalid();
    result.structures = [...input.structures];
  }
  return result;
};
