import { useCallback } from "react";
import { catalogGridPreferenceScope } from "./catalogGridPreferenceScope";
import { useCatalogScopedPreference } from "./useCatalogScopedPreference";
import { catalogSortCodec, catalogHiddenCodec, catalogSubfoldersCodec } from "./catalogViewPreferenceCodecs";

export function useCatalogViewOptions(favoritePath: string | null, currentPath: string | null, initialIncludeSubfolders = false) {
  const { scope } = catalogGridPreferenceScope(favoritePath, currentPath);
  const sort = useCatalogScopedPreference(scope, "name-ascending", catalogSortCodec);
  const hidden = useCatalogScopedPreference(scope, false, catalogHiddenCodec);
  const subfolders = useCatalogScopedPreference(scope, initialIncludeSubfolders, catalogSubfoldersCodec);
  const dismissError = useCallback(() => { sort.dismissError(); hidden.dismissError(); subfolders.dismissError(); }, [sort.dismissError, hidden.dismissError, subfolders.dismissError]);
  return { sort: sort.value, setSort: sort.update, showHidden: hidden.value, toggleHidden: () => hidden.update(!hidden.current()),
    includeSubfolders: subfolders.value, toggleSubfolders: () => subfolders.update(!subfolders.current()),
    options: { sort: sort.value, excludeHidden: !hidden.value, includeSubfolders: subfolders.value },
    error: sort.error || hidden.error || subfolders.error, dismissError };
}
