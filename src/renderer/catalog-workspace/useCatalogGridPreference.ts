import { useCallback, useEffect, useRef, useState } from "react";
import { catalogGridScopeKey, readCatalogGridPreferences } from "../../../electron/catalogGridPreferenceRules";
import type { CatalogGridPreferenceMap } from "../../shared/catalogGridPreferenceTypes";
import { normalizeWindowsPathKey } from "../filePath";

export function useCatalogGridPreference(favoritePath: string | null, currentPath: string | null) {
  const favorite = favoritePath && normalizeWindowsPathKey(favoritePath), current = currentPath && normalizeWindowsPathKey(currentPath);
  const scope = favorite && current && (current === favorite || current.startsWith(`${favorite}\\`)) ? favoritePath : null;
  const key = catalogGridScopeKey(scope);
  const [modes, setModes] = useState<CatalogGridPreferenceMap>({}), [error, setError] = useState(false);
  const ref = useRef(modes); ref.current = modes;
  const sequences = useRef(new Map<string, number>()), generation = useRef(0);
  const confirmed = useRef<CatalogGridPreferenceMap>({}), acknowledged = useRef(new Map<string, number>());
  useEffect(() => {
    const owner = ++generation.current;
    void window.cap7ce?.preferences?.getCatalogGrid?.().then(value => {
      if (generation.current !== owner) return;
      const saved = readCatalogGridPreferences(value); confirmed.current = { ...saved, ...confirmed.current };
      setModes(previous => ({ ...saved, ...previous }));
    }).catch(() => { if (generation.current === owner) setError(true); });
    return () => { generation.current++; };
  }, []);
  const mode = modes[key] ?? (scope === null ? "square" : "gallery");
  const toggle = () => {
    const previous = ref.current[key] ?? (scope === null ? "square" : "gallery"), next = previous === "square" ? "gallery" : "square";
    const sequence = (sequences.current.get(key) ?? 0) + 1, owner = generation.current;
    sequences.current.set(key, sequence); ref.current = { ...ref.current, [key]: next }; setModes(ref.current); setError(false);
    void window.cap7ce?.preferences?.updateCatalogGrid?.(scope, next).then(() => {
      if (generation.current === owner && sequence >= (acknowledged.current.get(key) ?? 0)) {
        acknowledged.current.set(key, sequence); confirmed.current = { ...confirmed.current, [key]: next };
      }
    }).catch(() => {
      if (generation.current !== owner || sequences.current.get(key) !== sequence) return;
      setModes(value => ({ ...value, [key]: confirmed.current[key] ?? (scope === null ? "square" : "gallery") })); setError(true);
    });
  };
  const dismissError = useCallback(() => setError(false), []);
  return { mode, toggle, error, dismissError };
}
