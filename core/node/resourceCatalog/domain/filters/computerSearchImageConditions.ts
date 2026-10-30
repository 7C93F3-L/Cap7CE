import type { SearchState } from "../../../../../src/shared/types";
import type { ComputerSearchConditions, ComputerSearchVisualGroup } from "../../../../../src/shared/computerSearchFactTypes";
import { searchVisualColors, searchImageColorTraits, searchImageAnimationModes } from "../formats/imageSearchFilters";
import { searchVideoVisualColors, searchVideoColorTraits } from "../formats/videoSearchFilters";
import { getVisualPropertySemanticConditionBySemantic } from "../formats/visualPropertySemantics";
import { toComputerSearchScalarConditions } from "./computerSearchScalarConditions";

const group = (values: readonly string[], allowed: readonly string[]): ComputerSearchVisualGroup | undefined => {
  if (values.length === 0) return undefined;
  if (values.some(value => !allowed.includes(value))) throw new Error("computer-search-invalid-image-selection");
  return { alternatives: [...new Set(values)].map(value => {
    const condition = getVisualPropertySemanticConditionBySemantic(value);
    if (!condition) throw new Error("computer-search-invalid-image-selection");
    return condition.constraints.map(constraint => ({ ...constraint }));
  }) };
};
// Image property selectors reuse the existing semantics; colors and traits each form a union.
export const toComputerSearchImageConditions = (search: SearchState, referenceNow = new Date()): ComputerSearchConditions => {
  const result = toComputerSearchScalarConditions(search, referenceNow);
  const colors = group(search.visualColors ?? [], searchVisualColors);
  const traits = group(search.imageColorTraits ?? [], searchImageColorTraits);
  const videoColors = group(search.videoVisualColors ?? [], searchVideoVisualColors);
  const videoTraits = group(search.videoColorTraits ?? [], searchVideoColorTraits);
  if (videoColors || videoTraits) {
    if (colors || traits || search.imageAnimation || result.facts?.kind === "image-dimensions")
      throw new Error("computer-search-mixed-media-conditions");
    return { ...result, facts: { ...result.facts, kind: "video", visualGroups:
      [videoColors, videoTraits].filter((value): value is ComputerSearchVisualGroup => value !== undefined) } };
  }
  if (!colors && !traits && !search.imageAnimation) return result;
  if (result.facts?.kind === "video") throw new Error("computer-search-mixed-media-conditions");
  const facts = { ...result.facts, kind: "image-dimensions" as const };
  if (search.imageAnimation) {
    if (!searchImageAnimationModes.includes(search.imageAnimation)) throw new Error("computer-search-invalid-image-selection");
    facts.isAnimated = search.imageAnimation === "animated";
  }
  const groups = [colors, traits].filter((value): value is ComputerSearchVisualGroup => value !== undefined);
  if (groups.length) facts.visualGroups = groups;
  return { ...result, facts };
};
