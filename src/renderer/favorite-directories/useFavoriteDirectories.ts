import { useCallback, useEffect, useRef, useState } from "react";
import type { FavoriteDirectory, FavoriteDirectoryApi } from "../../shared/favoriteDirectoryTypes";

export function useFavoriteDirectories() {
  const [directories, setDirectories] = useState<FavoriteDirectory[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const pending = useRef(false);
  const run = useCallback(async (action: (api: FavoriteDirectoryApi) => Promise<FavoriteDirectory[]>) => {
    if (pending.current) return false;
    const owner = generation.current;
    pending.current = true; setBusy(true); setError(false);
    try {
      const api = window.cap7ce?.favoriteDirectories;
      if (!api) throw new Error("favorite-bridge-unavailable");
      const next = await action(api);
      if (generation.current !== owner) return false;
      setDirectories(next);
      return true;
    } catch {
      if (generation.current === owner) setError(true);
      return false;
    } finally {
      if (generation.current === owner) { pending.current = false; setBusy(false); }
    }
  }, []);
  useEffect(() => {
    void run(api => api.list());
    return () => { generation.current++; pending.current = false; };
  }, [run]);
  return {
    directories, busy, error,
    reload: () => run(api => api.list()),
    choose: () => run(api => api.choose()),
    rename: (id: string, name: string) => run(api => api.rename(id, name)),
    remove: (id: string) => run(api => api.remove(id)),
    move: (id: string, direction: "up" | "down") => run(api => api.move(id, direction))
  };
}
