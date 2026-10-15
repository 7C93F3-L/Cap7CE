import { useCallback, useEffect, useRef, useState } from "react";
import { catalogGridScopeKey } from "../../../electron/catalogGridPreferenceRules";
import { renameDirectoryPreferenceKeys } from "../../../electron/directoryRenamePaths";
import { useDirectoryRename } from "../favorite-directories/directoryRenameEvents";
export function useCatalogScopedPreference<T>(scope: string | null, fallback: T, codec: {
  read: (value: unknown) => Record<string, T>; load: () => Promise<unknown> | undefined;
  save: (scope: string | null, value: T) => Promise<unknown> | undefined;
}) {
  const key = catalogGridScopeKey(scope), [values, setValues] = useState<Record<string, T>>({}), [error, setError] = useState(false);
  const ref = useRef(values); ref.current = values;
  const sequences = useRef(new Map<string, number>()), generation = useRef(0);
  const confirmed = useRef<Record<string, T>>({}), acknowledged = useRef(new Map<string, number>());
  useDirectoryRename(change => {
    confirmed.current = renameDirectoryPreferenceKeys(confirmed.current, change);
    ref.current = renameDirectoryPreferenceKeys(ref.current, change); setValues(ref.current);
  });
  useEffect(() => {
    const owner = ++generation.current;
    void codec.load()?.then(value => {
      if (generation.current !== owner) return;
      const saved = codec.read(value); confirmed.current = { ...saved, ...confirmed.current };
      setValues(previous => ({ ...saved, ...previous }));
    }).catch(() => { if (generation.current === owner) setError(true); });
    return () => { generation.current++; };
  }, [codec, key]);
  const current = () => ref.current[key] ?? fallback;
  const update = (next: T, force = false) => {
    if (!force && current() === next) return;
    const sequence = (sequences.current.get(key) ?? 0) + 1, owner = generation.current;
    sequences.current.set(key, sequence); ref.current = { ...ref.current, [key]: next }; setValues(ref.current); setError(false);
    void codec.save(scope, next)?.then(() => {
      if (generation.current === owner && sequence >= (acknowledged.current.get(key) ?? 0)) {
        acknowledged.current.set(key, sequence); confirmed.current = { ...confirmed.current, [key]: next };
      }
    }).catch(() => {
      if (generation.current !== owner || sequences.current.get(key) !== sequence) return;
      setValues(value => ({ ...value, [key]: confirmed.current[key] ?? fallback })); setError(true);
    });
  };
  const dismissError = useCallback(() => setError(false), []);
  return { value: values[key] ?? fallback, current, update, error, dismissError };
}
