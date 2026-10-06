import { useCallback, useState } from "react";
import { useSkimNavigationHistory } from "../controllers/useSkimNavigationHistory";
import { getDirectoryPath, normalizeWindowsPathKey } from "../filePath";

export function useCatalogDirectoryNavigation(scopePath: string | null, clearQuery: () => void, browseChildren = false) {
  const [initial] = useState(() => ({ path: scopePath, browseChildren }));
  const [location, setLocation] = useState(initial);
  const load = useCallback(async (next: typeof initial) => {
    clearQuery(); setLocation(next); return true;
  }, [clearQuery]);
  const history = useSkimNavigationHistory(load, initial);
  const open = useCallback((value: string) => {
    const path = value.trim().replace(/\//g, "\\");
    if (!/^[A-Za-z]:\\/.test(path) || /[\0\r\n]/.test(path)) return;
    if (location.browseChildren && normalizeWindowsPathKey(location.path ?? "") === normalizeWindowsPathKey(path)) return;
    history.open({ path, browseChildren: true });
  }, [history.open, location]);
  const reset = useCallback(() => history.open(initial), [history.open, initial]);
  const openBrowser = useCallback((path: string | null) => {
    if (path === null) history.open({ path: null, browseChildren: true }); else open(path);
  }, [history.open, open]);
  const parent = location.path ? getDirectoryPath(location.path) : "";
  return { ...location, ...history, open, reset, openBrowser, parentPath: parent || null, canUp: Boolean(location.path),
    up: () => { if (parent) open(parent); else if (location.path) openBrowser(null); } };
}
