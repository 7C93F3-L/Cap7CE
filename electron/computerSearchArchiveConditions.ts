import type { ComputerSearchArchiveFilter } from "../src/shared/computerSearchArchiveTypes";
import { searchArchiveContentTypes, searchArchiveStructures } from "./archiveSearchFilters";
const invalid = (): never => { throw new Error("computer-search-invalid-facts"); };
export const readComputerSearchArchive = (value: unknown): ComputerSearchArchiveFilter => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !["minimumFileCount", "maximumFileCount", "contentTypes", "structures"].includes(key))) return invalid();
  const result: ComputerSearchArchiveFilter = {};
  for (const key of ["minimumFileCount", "maximumFileCount"] as const) if (input[key] !== undefined) {
    if (!Number.isSafeInteger(input[key]) || Number(input[key]) < 0 || Number(input[key]) > 2_000_000_000) return invalid();
    result[key] = input[key] as number;
  }
  if (result.minimumFileCount !== undefined && result.maximumFileCount !== undefined && result.minimumFileCount > result.maximumFileCount) return invalid();
  for (const [key, allowed] of [["contentTypes", searchArchiveContentTypes], ["structures", searchArchiveStructures]] as const) if (input[key] !== undefined) {
    const values = input[key];
    if (!Array.isArray(values) || !values.length || values.length > allowed.length || values.some(item => !allowed.some(choice => item === choice))) return invalid();
    Object.assign(result, { [key]: [...values] });
  }
  return result;
};
