import { readCatalogGridPreferenceValues } from "./catalogGridPreferenceRules";
import type { CatalogGridSizePreferenceMap } from "../src/shared/catalogGridPreferenceTypes";

export const catalogGridSizeLimits = { minimum: 50, maximum: 200, step: 5, default: 100 } as const;
export const normalizeCatalogGridSize = (value: number) => Number.isFinite(value)
  ? Math.max(50, Math.min(200, Math.round(value / 5) * 5)) : 100;
export const isCatalogGridSize = (value: unknown): value is number => typeof value === "number"
  && Number.isFinite(value) && value >= 50 && value <= 200 && value % 5 === 0;
export const readCatalogGridSizes = (value: unknown): CatalogGridSizePreferenceMap => readCatalogGridPreferenceValues(value, isCatalogGridSize);
