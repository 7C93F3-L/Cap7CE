import type { ComputerSearchFileConditions } from "../src/shared/computerSearchFactTypes";

const invalid = (): never => { throw new Error("computer-search-invalid-file-conditions"); };
const fields = ["extensions", "minimumSizeBytes", "maximumSizeBytes", "minimumModifiedFileTime", "maximumModifiedFileTime"];
export const readComputerSearchFileConditions = (input: unknown): ComputerSearchFileConditions | undefined => {
  if (input === undefined) return undefined;
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !fields.includes(key))) return invalid();
  const value = input as Record<string, unknown>;
  const result: ComputerSearchFileConditions = {};
  if (value.extensions !== undefined) {
    if (!Array.isArray(value.extensions) || value.extensions.length > 128
      || !value.extensions.every(extension => typeof extension === "string" && extension.length >= 2 && extension.length <= 64
        && extension.startsWith(".") && !/[\s\x00-\x1f\x7f\\/]/.test(extension))
      || new Set(value.extensions.map(extension => extension.toLowerCase())).size !== value.extensions.length) return invalid();
    result.extensions = [...value.extensions];
  }
  for (const field of ["minimumSizeBytes", "maximumSizeBytes"] as const) {
    if (value[field] !== undefined) {
      if (!Number.isSafeInteger(value[field]) || Number(value[field]) < 0) return invalid();
      result[field] = value[field] as number;
    }
  }
  for (const field of ["minimumModifiedFileTime", "maximumModifiedFileTime"] as const) {
    if (value[field] !== undefined) {
      const text = value[field];
      if (typeof text !== "string" || !/^\d{1,19}$/.test(text) || BigInt(text) > 9223372036854775807n) return invalid();
      result[field] = text;
    }
  }
  if (result.minimumSizeBytes !== undefined && result.maximumSizeBytes !== undefined && result.minimumSizeBytes > result.maximumSizeBytes) return invalid();
  if (result.minimumModifiedFileTime !== undefined && result.maximumModifiedFileTime !== undefined
    && BigInt(result.minimumModifiedFileTime) > BigInt(result.maximumModifiedFileTime)) return invalid();
  return result;
};
