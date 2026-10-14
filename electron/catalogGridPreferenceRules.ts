import type { CatalogGridMode, CatalogGridPreferenceMap } from "../src/shared/catalogGridPreferenceTypes";
export const catalogGridScopeKey = (favoritePath: string | null) => favoritePath === null ? "computer"
  : `favorite:${favoritePath.trim().replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase()}`;
export const isCatalogGridMode = (value: unknown): value is CatalogGridMode => value === "square" || value === "gallery";
export const isCatalogGridScopePath = (value: unknown): value is string | null => value === null
  || typeof value === "string" && value.length <= 32768 && !/[\0\r\n]/.test(value)
    && (/^[A-Za-z]:(?:[\\/]|$)/.test(value) || /^\\\\[^\\]+\\[^\\]+/.test(value));
export function readCatalogGridPreferenceValues<T>(value: unknown, valid: (value: unknown) => value is T): Record<string, T> {
  const result: Record<string, T> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [key, mode] of Object.entries(value)) {
    if (!valid(mode)) continue;
    if (key === "computer") result[key] = mode;
    else if (key.startsWith("favorite:") && isCatalogGridScopePath(key.slice(9))) result[catalogGridScopeKey(key.slice(9))] = mode;
  }
  return result;
}
export const readCatalogGridPreferences = (value: unknown): CatalogGridPreferenceMap => readCatalogGridPreferenceValues(value, isCatalogGridMode);
