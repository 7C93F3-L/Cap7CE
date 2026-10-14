import { readCatalogGridPreferences } from "../../../electron/catalogGridPreferenceRules";
import type { CatalogGridMode } from "../../shared/catalogGridPreferenceTypes";
import { catalogGridPreferenceScope } from "./catalogGridPreferenceScope";
import { useCatalogScopedPreference } from "./useCatalogScopedPreference";

const codec = { read: readCatalogGridPreferences, load: () => window.cap7ce?.preferences?.getCatalogGrid?.(),
  save: (scope: string | null, mode: CatalogGridMode) => window.cap7ce?.preferences?.updateCatalogGrid?.(scope, mode) };
export function useCatalogGridPreference(favoritePath: string | null, currentPath: string | null) {
  const { scope } = catalogGridPreferenceScope(favoritePath, currentPath);
  const saved = useCatalogScopedPreference<CatalogGridMode>(scope, scope === null ? "square" : "gallery", codec);
  return { mode: saved.value, toggle: () => saved.update(saved.current() === "square" ? "gallery" : "square"),
    error: saved.error, dismissError: saved.dismissError };
}
