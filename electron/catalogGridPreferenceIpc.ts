import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";
import { catalogGridPreferences, catalogGridSizes, catalogViewPreferences } from "./catalogGridPreferenceRegistry";

export function registerCatalogGridPreferenceIpc(registrar: IpcRegistrar,
  store: Pick<typeof catalogGridPreferences, "get" | "update"> = catalogGridPreferences,
  sizes: Pick<typeof catalogGridSizes, "get" | "update"> = catalogGridSizes,
  view: Pick<typeof catalogViewPreferences, "get" | "update"> = catalogViewPreferences) {
  registerIpcDomain({ registrar, registrations: [
    { kind: "handle", channel: "preferences:getCatalogGrid", listener: () => store.get() },
    { kind: "handle", channel: "preferences:updateCatalogGrid", listener: (_event, scopePath, mode) => store.update(scopePath, mode) },
    { kind: "handle", channel: "preferences:getCatalogGridSize", listener: () => sizes.get() },
    { kind: "handle", channel: "preferences:updateCatalogGridSize", listener: (_event, scopePath, size) => sizes.update(scopePath, size) },
    { kind: "handle", channel: "preferences:getCatalogView", listener: () => view.get() },
    { kind: "handle", channel: "preferences:updateCatalogView", listener: (_event, scopePath, patch) => view.update(scopePath, patch) }
  ] });
}
