import type { CatalogViewPreference, CatalogViewPreferenceMap } from "../src/shared/catalogViewPreferenceTypes";
import { readCatalogGridPreferenceValues } from "./catalogGridPreferenceRules";
const sorts = ["name-ascending", "name-descending", "modified-ascending", "modified-descending"];
export const isCatalogViewPreference = (value: unknown): value is CatalogViewPreference => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.length <= 3 && entries.every(([key, item]) => key === "sort"
    ? typeof item === "string" && sorts.includes(item) : ["showHidden", "includeSubfolders"].includes(key) && typeof item === "boolean");
};
export const readCatalogViewPreferences = (value: unknown): CatalogViewPreferenceMap => readCatalogGridPreferenceValues(value, isCatalogViewPreference);
