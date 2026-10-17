import { readCatalogViewPreferences } from "../../../electron/catalogViewPreferenceRules";
import type { CatalogViewOptions, CatalogViewPreference, CatalogViewPreferenceMap } from "../../shared/catalogViewPreferenceTypes";
let pending: Promise<CatalogViewPreferenceMap> | undefined;
const load = () => {
  if (!pending) {
    pending = window.cap7ce?.preferences?.getCatalogView?.();
    const current = pending;
    void current?.then(() => { if (pending === current) pending = undefined; }, () => { if (pending === current) pending = undefined; });
  }
  return pending;
};
const codec = <K extends keyof CatalogViewOptions>(field: K) => ({ load,
  read: (value: unknown): Record<string, CatalogViewOptions[K]> => Object.fromEntries(Object.entries(readCatalogViewPreferences(value))
    .filter(([, preference]) => preference[field] !== undefined).map(([key, preference]) => [key, preference[field] as CatalogViewOptions[K]])),
  save: (scope: string | null, value: CatalogViewOptions[K]) => window.cap7ce?.preferences?.updateCatalogView?.(scope, { [field]: value } as CatalogViewPreference)
});
export const catalogSortCodec = codec("sort"), catalogHiddenCodec = codec("showHidden"), catalogSubfoldersCodec = codec("includeSubfolders");
