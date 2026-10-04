import type { ModelPrecision } from "./modelFactTypes";

export const searchModelParameterCounts = ["under-1b", "1b-3b", "3b-7b", "7b-14b", "14b-or-more"] as const;
export type SearchModelParameterCount = typeof searchModelParameterCounts[number];

export const searchModelPrecisions = ["f32", "f16-bf16", "8bit", "6bit", "5bit", "4bit", "3bit-or-less"] as const satisfies readonly ModelPrecision[];
export type SearchModelPrecision = typeof searchModelPrecisions[number];

export const hasModelSearchFacets = (search: {
  modelParameterCounts?: readonly unknown[];
  modelPrecisions?: readonly unknown[];
}) => Boolean(search.modelParameterCounts?.length || search.modelPrecisions?.length);

export const matchesModelParameterCount = (count: number, preset: SearchModelParameterCount) => {
  if (preset === "under-1b") return count < 1_000_000_000;
  if (preset === "1b-3b") return count >= 1_000_000_000 && count < 3_000_000_000;
  if (preset === "3b-7b") return count >= 3_000_000_000 && count < 7_000_000_000;
  if (preset === "7b-14b") return count >= 7_000_000_000 && count < 14_000_000_000;
  return count >= 14_000_000_000;
};
