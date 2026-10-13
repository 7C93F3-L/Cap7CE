import type { CatalogWorkspaceState } from "../../shared/catalogWorkspaceTypes";
import type { FavoriteDirectory } from "../../shared/favoriteDirectoryTypes";

export const maximumCatalogContexts = 32;
const pathKey = (value: string | null) => value?.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase() ?? null;
export type CatalogWorkspaceAction =
  | { type: "open"; scopePath: string | null; name: string; kind?: "search" | "browse" }
  | { type: "new-tab"; scopePath: string | null; name: string }
  | { type: "replace"; scopePath: string | null; name: string; favoritePath?: string | null }
  | { type: "location"; id: string; path: string | null }
  | { type: "select" | "close"; id: string }
  | { type: "favorite-names"; directories: readonly FavoriteDirectory[] }
  | { type: "dismiss-limit" };

export function createCatalogWorkspace(name: string): CatalogWorkspaceState {
  return { contexts: [{ id: "catalog:all", kind: "search", scopePath: null, name }], activeId: "catalog:all", nextId: 1, openLimitReached: false, homeName: name };
}

// Context identity is independent of a saved favorite. Each mounted view owns its
// query, filters, selection and scroll; removing a shortcut cannot retire that view.
export function catalogWorkspaceReducer(state: CatalogWorkspaceState, action: CatalogWorkspaceAction): CatalogWorkspaceState {
  if (action.type === "replace") {
    const context = { id: `catalog:${state.nextId}`, kind: "search" as const, scopePath: action.scopePath, name: action.name, favoritePath: action.favoritePath ?? null };
    return { ...state, contexts: state.contexts.map(value => value.id === state.activeId ? context : value),
      activeId: context.id, nextId: state.nextId + 1, openLimitReached: false };
  }
  if (action.type === "open" || action.type === "new-tab") {
    const kind = action.type === "new-tab" ? (action.scopePath ? "browse" : "search") : action.kind ?? "search";
    const existing = action.type === "open" && state.contexts.find(context => context.kind === kind && pathKey(context.scopePath) === pathKey(action.scopePath));
    if (existing) return { ...state, activeId: existing.id, openLimitReached: false };
    if (state.contexts.length >= maximumCatalogContexts || !Number.isSafeInteger(state.nextId + 1))
      return { ...state, openLimitReached: true };
    const context = { id: `catalog:${state.nextId}`, kind, scopePath: action.scopePath, name: action.name };
    return { ...state, contexts: [...state.contexts, context], activeId: context.id, nextId: state.nextId + 1, openLimitReached: false };
  }
  if (action.type === "select") return state.contexts.some(context => context.id === action.id)
    ? { ...state, activeId: action.id, openLimitReached: false } : state;
  if (action.type === "close") {
    const index = state.contexts.findIndex(context => context.id === action.id);
    if (index < 0) return state;
    const contexts = state.contexts.filter(context => context.id !== action.id);
    if (!contexts.length) {
      const id = `catalog:${state.nextId}`;
      return { ...state, contexts: [{ id, kind: "search", scopePath: null, name: state.homeName }], activeId: id,
        nextId: state.nextId + 1, openLimitReached: false };
    }
    return { ...state, contexts, activeId: state.activeId === action.id ? contexts[Math.max(0, index - 1)].id : state.activeId, openLimitReached: false };
  }
  if (action.type === "location") {
    const contexts = state.contexts.map(context => {
      if (context.id !== action.id) return context;
      const displayName = pathKey(action.path) === pathKey(context.scopePath) ? undefined
        : action.path ? action.path.replace(/[/\\]+$/, "").split(/[/\\]/).pop() : state.homeName;
      return context.displayName === displayName ? context : { ...context, displayName };
    });
    return contexts.every((context, index) => context === state.contexts[index]) ? state : { ...state, contexts };
  }
  if (action.type === "favorite-names") {
    const names = new Map(action.directories.map(directory => [pathKey(directory.path), directory.name]));
    const contexts = state.contexts.map(context => {
      const name = names.get(pathKey(context.scopePath));
      return name && name !== context.name ? { ...context, name } : context;
    });
    return contexts.some((context, index) => context !== state.contexts[index]) ? { ...state, contexts } : state;
  }
  return state.openLimitReached ? { ...state, openLimitReached: false } : state;
}
