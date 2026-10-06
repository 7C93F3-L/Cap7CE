import type { ComputerSearchFontFilter } from "../src/shared/computerSearchFontTypes";
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const invalid = (): never => { throw new Error("computer-search-invalid-facts"); };
export const readComputerSearchFont = (value: unknown): ComputerSearchFontFilter => {
  if (!object(value) || Object.keys(value).some(key => !["weightRanges", "italic", "supportsLatin", "supportsChinese", "variable"].includes(key))) return invalid();
  const font: ComputerSearchFontFilter = {};
  for (const key of ["italic", "supportsLatin", "supportsChinese", "variable"] as const) if (value[key] !== undefined) {
    if (typeof value[key] !== "boolean") return invalid();
    font[key] = value[key];
  }
  if (value.weightRanges !== undefined) {
    if (!Array.isArray(value.weightRanges) || value.weightRanges.length < 1 || value.weightRanges.length > 5) return invalid();
    font.weightRanges = value.weightRanges.map(input => {
      if (!object(input) || Object.keys(input).some(key => !["minimum", "maximum"].includes(key))
        || input.minimum === undefined && input.maximum === undefined) return invalid();
      const range: { minimum?: number; maximum?: number } = {};
      for (const key of ["minimum", "maximum"] as const) if (input[key] !== undefined) {
        if (!Number.isInteger(input[key]) || Number(input[key]) < 1 || Number(input[key]) > 1000) return invalid();
        range[key] = input[key] as number;
      }
      if (range.minimum !== undefined && range.maximum !== undefined && range.minimum > range.maximum) return invalid();
      return range;
    });
  }
  return font;
};
