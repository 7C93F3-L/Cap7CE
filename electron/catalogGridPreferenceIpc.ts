import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";
import { catalogGridPreferences, catalogGridSizes } from "./catalogGridPreferenceRegistry";

export function registerCatalogGridPreferenceIpc(registrar: IpcRegistrar,
  store: Pick<typeof catalogGridPreferences, "get" | "update"> = catalogGridPreferences,
  sizes: Pick<typeof catalogGridSizes, "get" | "update"> = catalogGridSizes) {
  registerIpcDomain({ registrar, registrations: [
    { kind: "handle", channel: "preferences:getCatalogGrid", listener: () => store.get() },
    { kind: "handle", channel: "preferences:updateCatalogGrid", listener: (_event, scopePath, mode) => store.update(scopePath, mode) },
    { kind: "handle", channel: "preferences:getCatalogGridSize", listener: () => sizes.get() },
    { kind: "handle", channel: "preferences:updateCatalogGridSize", listener: (_event, scopePath, size) => sizes.update(scopePath, size) }
  ] });
}
