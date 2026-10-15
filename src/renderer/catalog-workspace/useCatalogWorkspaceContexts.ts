import { useCallback, useEffect, useReducer } from "react";
import { t } from "../../../electron/localization";
import type { FavoriteDirectory } from "../../shared/favoriteDirectoryTypes";
import { catalogWorkspaceReducer, createCatalogWorkspace } from "./catalogWorkspaceContexts";
import { useDirectoryRename } from "../favorite-directories/directoryRenameEvents";

export function useCatalogWorkspaceContexts(directories: readonly FavoriteDirectory[]) {
  const [state, dispatch] = useReducer(catalogWorkspaceReducer, undefined, () => createCatalogWorkspace(t("favorites.allFiles")));
  useDirectoryRename(change => dispatch({ type: "relocate", change }));
  useEffect(() => { dispatch({ type: "favorite-names", directories }); }, [directories]);
  const open = useCallback((directory: FavoriteDirectory | null) => dispatch({
    type: "entry", scopePath: directory?.path ?? null, name: directory?.name ?? t("favorites.allFiles")
  }), []);
  const openBrowser = useCallback((path: string | null) => dispatch({ type: "replace", scopePath: path,
    favoritePath: state.contexts.find(context => context.id === state.activeId)?.favoritePath ?? null,
    name: path ? path.replace(/\\+$/, "").split(/[/\\]/).pop() || path : t("favorites.allFiles") }), [state.contexts, state.activeId]);
  const location = useCallback((id: string, path: string | null) => dispatch({ type: "location", id, path }), []);
  const select = useCallback((id: string) => dispatch({ type: "select", id }), []);
  const close = useCallback((id: string) => dispatch({ type: "close", id }), []);
  const dismissLimit = useCallback(() => dispatch({ type: "dismiss-limit" }), []);
  return { ...state, open, openBrowser, location, select, close, dismissLimit };
}
