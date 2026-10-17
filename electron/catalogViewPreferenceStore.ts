import { CatalogGridPreferenceStore } from "./catalogGridPreferenceStore";
import { isCatalogViewPreference, readCatalogViewPreferences } from "./catalogViewPreferenceRules";
import type { CatalogViewPreference } from "../src/shared/catalogViewPreferenceTypes";
import type { DirectoryRename } from "../src/shared/directoryRenameTypes";
export class CatalogViewPreferenceStore {
  private readonly store: CatalogGridPreferenceStore<CatalogViewPreference>;
  constructor(filePath: () => string) { this.store = new CatalogGridPreferenceStore(filePath, { read: readCatalogViewPreferences, valid: isCatalogViewPreference }); }
  get() { return this.store.get(); }
  update(scopePath: unknown, patch: unknown) {
    if (!isCatalogViewPreference(patch)) return Promise.reject(Error("catalog-view-invalid-preference"));
    const changes = { ...patch };
    return this.store.updateWith(scopePath, current => ({ ...current, ...changes }));
  }
  relocate(change: DirectoryRename) { return this.store.relocate(change); }
}
