import { useCallback } from "react";
import { useCatalogGridPreference } from "./useCatalogGridPreference";
import { useCatalogGridSizePreference } from "./useCatalogGridSizePreference";

export function useCatalogGridPresentation(favoritePath: string | null, currentPath: string | null) {
  const mode = useCatalogGridPreference(favoritePath, currentPath), size = useCatalogGridSizePreference(favoritePath, currentPath);
  const dismissError = useCallback(() => { mode.dismissError(); size.dismissError(); }, [mode.dismissError, size.dismissError]);
  return { mode: mode.mode, toggle: mode.toggle, size: size.size, previewSize: size.preview, commitSize: size.commit,
    error: mode.error || size.error, dismissError };
}
