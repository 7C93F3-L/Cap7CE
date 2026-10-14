import { catalogGridScopeKey } from "../../../electron/catalogGridPreferenceRules";
import { normalizeWindowsPathKey } from "../filePath";

export function catalogGridPreferenceScope(favoritePath: string | null, currentPath: string | null) {
  const favorite = favoritePath && normalizeWindowsPathKey(favoritePath), current = currentPath && normalizeWindowsPathKey(currentPath);
  const scope = favorite && current && (current === favorite || current.startsWith(`${favorite}\\`)) ? favoritePath : null;
  return { scope, key: catalogGridScopeKey(scope) };
}
