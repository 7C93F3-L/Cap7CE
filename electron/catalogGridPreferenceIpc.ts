import { app } from "electron";
import path from "node:path";
import { CatalogGridPreferenceStore } from "./catalogGridPreferenceStore";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";
import { isCatalogGridSize, readCatalogGridSizes } from "./catalogGridSizeRules";

export function registerCatalogGridPreferenceIpc(registrar: IpcRegistrar,
  store = new CatalogGridPreferenceStore(() => path.join(app.getPath("userData"), "config", "catalog-grid.json")),
  sizes = new CatalogGridPreferenceStore<number>(() => path.join(app.getPath("userData"), "config", "catalog-grid-sizes.json"), { read: readCatalogGridSizes, valid: isCatalogGridSize })) {
  registerIpcDomain({ registrar, registrations: [
    { kind: "handle", channel: "preferences:getCatalogGrid", listener: () => store.get() },
    { kind: "handle", channel: "preferences:updateCatalogGrid", listener: (_event, scopePath, mode) => store.update(scopePath, mode) },
    { kind: "handle", channel: "preferences:getCatalogGridSize", listener: () => sizes.get() },
    { kind: "handle", channel: "preferences:updateCatalogGridSize", listener: (_event, scopePath, size) => sizes.update(scopePath, size) }
  ] });
}
