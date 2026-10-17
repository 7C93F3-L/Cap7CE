import { useCallback, useState } from "react";
import type { CatalogRandomBrowseState } from "../../shared/catalogPresentationTypes";

export function useCatalogRandomBrowse(): CatalogRandomBrowseState {
  const [state, setState] = useState({ enabled: false, seed: 0, batchNumber: 0 });
  const toggle = useCallback(() => setState(current => current.enabled ? { ...current, enabled: false }
    : { enabled: true, seed: crypto.getRandomValues(new Uint32Array(1))[0], batchNumber: 1 }), []);
  const disable = useCallback(() => setState(current => current.enabled ? { ...current, enabled: false } : current), []);
  const next = useCallback(() => setState(current => current.enabled
    ? { enabled: true, seed: (current.seed + 1) >>> 0, batchNumber: current.batchNumber + 1 } : current), []);
  return { ...state, toggle, disable, next };
}
