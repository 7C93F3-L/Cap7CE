import type { CatalogWorkspaceState } from "../../shared/catalogWorkspaceTypes";
import type { DirectoryRename } from "../../shared/directoryRenameTypes";
import { renamedDirectoryPath } from "../../../electron/directoryRenamePaths";

export function relocateCatalogWorkspace(state: CatalogWorkspaceState, change: DirectoryRename): CatalogWorkspaceState {
  return { ...state, contexts: state.contexts.map(context => {
    const scopePath = renamedDirectoryPath(context.scopePath, change), favoritePath = renamedDirectoryPath(context.favoritePath ?? null, change);
    return { ...context, scopePath, favoritePath,
      ...(scopePath !== context.scopePath && scopePath ? { name: scopePath.split(/[/\\]/).pop() || context.name } : {}) };
  }) };
}
