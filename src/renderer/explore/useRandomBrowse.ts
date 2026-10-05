import { useCallback, useMemo, useState } from "react";

const createSeed = () => {
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return value[0];
};

const scorePath = (filePath: string, seed: number) => {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < filePath.length; index += 1) {
    hash = Math.imul(hash ^ filePath.charCodeAt(index), 16777619) >>> 0;
  }
  return hash;
};

export const orderRandomBrowseItems = <T extends { filePath: string }>(items: readonly T[], seed: number) => (
  [...items].sort((left, right) => scorePath(left.filePath, seed) - scorePath(right.filePath, seed) || left.filePath.localeCompare(right.filePath))
);

export const useRandomBrowse = <T extends { filePath: string }>(items: readonly T[], onOrderChange: () => void) => {
  const [state, setState] = useState({ enabled: false, seed: 0, batchNumber: 0 });
  const toggle = useCallback(() => { setState((current) => current.enabled ? { ...current, enabled: false } : { enabled: true, seed: createSeed(), batchNumber: 1 }); onOrderChange(); }, [onOrderChange]);
  const disable = useCallback(() => { setState((current) => current.enabled ? { ...current, enabled: false } : current); onOrderChange(); }, [onOrderChange]);
  const next = useCallback(() => { setState((current) => current.enabled ? { enabled: true, seed: (current.seed + 1) >>> 0, batchNumber: current.batchNumber + 1 } : current); onOrderChange(); }, [onOrderChange]);
  const clear = useCallback(() => { setState({ enabled: false, seed: 0, batchNumber: 0 }); onOrderChange(); }, [onOrderChange]);
  const restore = useCallback((next: typeof state) => setState({ ...next }), []);
  const orderedItems = useMemo(() => state.enabled ? orderRandomBrowseItems(items, state.seed) : [...items], [items, state.enabled, state.seed]);
  return { ...state, items: orderedItems, toggle, disable, next, clear, restore };
};
