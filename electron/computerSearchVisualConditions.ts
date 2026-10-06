import type { ComputerSearchVisualGroup } from "../src/shared/computerSearchFactTypes";
import { imageMetadataMetrics } from "./metadataExtraction/imageMetadataMetrics";

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const invalid = (): never => { throw new Error("computer-search-invalid-facts"); };
export const readComputerSearchVisualGroups = (value: unknown): ComputerSearchVisualGroup[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) return invalid();
  return value.map(group => {
    if (!record(group) || Object.keys(group).length !== 1 || !Array.isArray(group.alternatives)
      || group.alternatives.length < 1 || group.alternatives.length > 12) return invalid();
    return { alternatives: group.alternatives.map(alternative => {
      if (!Array.isArray(alternative) || alternative.length < 1 || alternative.length > 8) return invalid();
      return alternative.map(constraint => {
        if (!record(constraint) || Object.keys(constraint).length !== 3 || typeof constraint.metric !== "string"
          || !imageMetadataMetrics.includes(constraint.metric) || typeof constraint.operator !== "string" || ![">", "<="].includes(constraint.operator)
          || !Number.isSafeInteger(constraint.value) || Number(constraint.value) < 0 || Number(constraint.value) > 10000) return invalid();
        return { metric: constraint.metric, operator: constraint.operator as ">" | "<=", value: constraint.value as number };
      });
    }) };
  });
};
