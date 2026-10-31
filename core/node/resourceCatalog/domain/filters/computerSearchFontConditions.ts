import type { SearchState } from "../../../../../core/shared/types";
import type { ComputerSearchConditions, ComputerSearchIntegerRange } from "../../../../../core/shared/computerSearchFactTypes";
import type { ComputerSearchFontFilter } from "../../../../../core/shared/computerSearchFontTypes";
import { searchFontWeights, searchFontStyles, searchFontCharacterSets, searchFontKinds } from "../formats/fontSearchFilters";
import { toComputerSearchAudioConditions } from "./computerSearchAudioConditions";

const weights: Record<string, ComputerSearchIntegerRange> = {
  thin: { minimum: 1, maximum: 349 }, regular: { minimum: 350, maximum: 449 },
  medium: { minimum: 450, maximum: 599 }, bold: { minimum: 600, maximum: 799 }, black: { minimum: 800, maximum: 1000 }
};
const selected = (values: readonly string[] | undefined, allowed: readonly string[]) => {
  if (values?.some(value => !allowed.includes(value))) throw new Error("computer-search-invalid-font-selection");
  return [...new Set(values ?? [])];
};
export const toComputerSearchFontConditions = (search: SearchState, referenceNow = new Date()): ComputerSearchConditions => {
  const result = toComputerSearchAudioConditions(search, referenceNow);
  const weight = selected(search.fontWeights, searchFontWeights), styles = selected(search.fontStyles, searchFontStyles);
  const sets = selected(search.fontCharacterSets, searchFontCharacterSets), kinds = selected(search.fontKinds, searchFontKinds);
  if (!weight.length && !styles.length && !sets.length && !kinds.length) return result;
  if (result.facts) throw new Error("computer-search-mixed-media-conditions");
  const font: ComputerSearchFontFilter = {};
  if (weight.length) font.weightRanges = weight.map(value => ({ ...weights[value] }));
  if (styles.length === 1) font.italic = styles[0] === "italic";
  if (kinds.length === 1) font.variable = kinds[0] === "variable";
  if (sets.includes("latin")) font.supportsLatin = true;
  if (sets.includes("chinese")) font.supportsChinese = true;
  return { ...result, facts: { kind: "font", font } };
};
