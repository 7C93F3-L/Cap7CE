import { useEffect, useRef, useState } from "react";
import { normalizeCatalogGridSize, readCatalogGridSizes } from "../../../electron/catalogGridSizeRules";
import { catalogGridPreferenceScope } from "./catalogGridPreferenceScope";
import { useCatalogScopedPreference } from "./useCatalogScopedPreference";

const codec = { read: readCatalogGridSizes, load: () => window.cap7ce?.preferences?.getCatalogGridSize?.(),
  save: (scope: string | null, size: number) => window.cap7ce?.preferences?.updateCatalogGridSize?.(scope, size) };
export function useCatalogGridSizePreference(favoritePath: string | null, currentPath: string | null) {
  const { scope, key } = catalogGridPreferenceScope(favoritePath, currentPath), saved = useCatalogScopedPreference<number>(scope, 100, codec);
  const [draft, setDraft] = useState<{ key: string; value: number } | null>(null);
  const frame = useRef(0), pending = useRef<{ key: string; value: number } | null>(null);
  const preview = (value: number) => {
    pending.current = { key, value: normalizeCatalogGridSize(value) };
    if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; setDraft(pending.current); });
  };
  const commit = (value: number, force = false) => {
    cancelAnimationFrame(frame.current); frame.current = 0; pending.current = null; setDraft(null);
    saved.update(normalizeCatalogGridSize(value), force);
  };
  useEffect(() => { setDraft(null); return () => { cancelAnimationFrame(frame.current); frame.current = 0; pending.current = null; }; }, [key]);
  return { size: draft?.key === key ? draft.value : saved.value, preview, commit, error: saved.error, dismissError: saved.dismissError };
}
