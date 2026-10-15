import { useCallback, useEffect, useRef, useState } from "react";
import type { FavoriteDirectory, FavoriteDirectoryApi } from "../../shared/favoriteDirectoryTypes";
import { notifyDirectoryRename } from "./directoryRenameEvents";

export function useFavoriteDirectories() {
  const [directories, setDirectories] = useState<FavoriteDirectory[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const run = useCallback(async (action: (api: FavoriteDirectoryApi) => Promise<FavoriteDirectory[]>, reportError = true) => {
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
      if (generation.current === owner && reportError) setError(true);
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
    directories, busy, error, notice, dismissNotice: () => setNotice(null),
    reload: () => { setNotice(null); return run(api => api.list()); },
    choose: () => run(api => api.choose()),
    add: (path: string) => run(api => api.add(path)),
    rename: (id: string, name: string) => run(api => api.rename(id, name)),
    renameFolder: (id: string, name: string) => run(async api => {
      setNotice(null);
      try {
        const result = await api.renameFolder(id, name);
        if (result.change) notifyDirectoryRename(result.change);
        if (result.warning) setNotice(result.warning);
        return result.directories;
      } catch (failure) { setNotice(failure instanceof Error ? failure.message : "folder-rename-failed"); throw failure; }
    }, false),
    reveal: (directory: FavoriteDirectory) => { void window.cap7ce?.files.open(directory.path).then(message => { if (message) setNotice(message); }).catch(() => setNotice("folder-open-failed")); },
    copyPath: (directory: FavoriteDirectory) => { void window.cap7ce?.files.copyPaths([directory.path]).then(count => { if (!count) setNotice("folder-copy-failed"); }).catch(() => setNotice("folder-copy-failed")); },
    remove: (id: string) => run(api => api.remove(id)),
    move: (id: string, direction: "up" | "down") => run(api => api.move(id, direction))
  };
}
