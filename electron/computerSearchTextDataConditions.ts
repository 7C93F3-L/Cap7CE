import type { ComputerSearchTextDataFilter } from "../src/shared/computerSearchTextDataTypes";
const invalid = (): never => { throw new Error("computer-search-invalid-facts"); };
const pairs = [["minimumCharacterCount", "maximumCharacterCount"], ["minimumLineCount", "maximumLineCount"],
  ["minimumRecordCount", "maximumRecordCount"], ["minimumColumnCount", "maximumColumnCount"]] as const;
export const readComputerSearchTextData = (value: unknown): ComputerSearchTextDataFilter => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const input = value as Record<string, unknown>;
  if (!["text", "csv", "json"].some(kind => kind === input.factKind)
    || Object.keys(input).some(key => !["factKind", "jsonRootKind", ...pairs.flat()].includes(key))) return invalid();
  const result: ComputerSearchTextDataFilter = { factKind: input.factKind as ComputerSearchTextDataFilter["factKind"] };
  for (const [min, max] of pairs) {
    for (const key of [min, max]) if (input[key] !== undefined) {
      if (!Number.isSafeInteger(input[key]) || Number(input[key]) < 0 || Number(input[key]) > 1_000_000_000) return invalid();
      result[key] = input[key] as number;
    }
    if (result[min] !== undefined && result[max] !== undefined && result[min]! > result[max]!) return invalid();
  }
  if (input.jsonRootKind !== undefined) {
    if (result.factKind !== "json" || input.jsonRootKind !== "array" && input.jsonRootKind !== "object") return invalid();
    result.jsonRootKind = input.jsonRootKind;
  }
  const allowed = result.factKind === "text" ? pairs.slice(0, 2).flat()
    : result.factKind === "csv" ? pairs.slice(2).flat() : [...pairs[2]];
  if (pairs.flat().some(key => result[key] !== undefined && !allowed.includes(key))) return invalid();
  return result;
};
