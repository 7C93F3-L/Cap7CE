import { useCallback, useEffect, useReducer, useRef } from "react";
import { t } from "../../../electron/localization";
import type { FavoriteDirectory } from "../../shared/favoriteDirectoryTypes";
import { catalogWorkspaceReducer, createCatalogWorkspace } from "./catalogWorkspaceContexts";

export function useCatalogWorkspaceContexts(directories: readonly FavoriteDirectory[]) {
  const [state, dispatch] = useReducer(catalogWorkspaceReducer, undefined, () => createCatalogWorkspace(t("favorites.allFiles")));
  const returnSearch = useRef("catalog:all");
  useEffect(() => { dispatch({ type: "favorite-names", directories }); }, [directories]);
  useEffect(() => {
    if (state.contexts.find(context => context.id === state.activeId)?.kind === "search") returnSearch.current = state.activeId;
  }, [state.activeId, state.contexts]);
  const open = useCallback((directory: FavoriteDirectory | null) => dispatch({
    type: "open", scopePath: directory?.path ?? null, name: directory?.name ?? t("favorites.allFiles")
  }), []);
  const openBrowser = useCallback((path: string | null) => dispatch({ type: "open", kind: "browse", scopePath: path,
    name: t("skim.name") + (path ? " · " + (path.replace(/\\+$/, "").split(/[/\\]/).pop() || path) : "") }), []);
  const toggleBrowser = useCallback((path: string | null) => {
    if (state.contexts.find(context => context.id === state.activeId)?.kind === "browse")
      dispatch({ type: "select", id: state.contexts.some(context => context.id === returnSearch.current) ? returnSearch.current : "catalog:all" });
    else { returnSearch.current = state.activeId; openBrowser(path); }
  }, [state.activeId, state.contexts, openBrowser]);
  const select = useCallback((id: string) => dispatch({ type: "select", id }), []);
  const close = useCallback((id: string) => dispatch({ type: "close", id }), []);
  const dismissLimit = useCallback(() => dispatch({ type: "dismiss-limit" }), []);
  return { ...state, open, openBrowser, toggleBrowser, select, close, dismissLimit };
}
