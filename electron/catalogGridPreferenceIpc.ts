import { app } from "electron";
import path from "node:path";
import { CatalogGridPreferenceStore } from "./catalogGridPreferenceStore";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";

export function registerCatalogGridPreferenceIpc(registrar: IpcRegistrar,
  store = new CatalogGridPreferenceStore(() => path.join(app.getPath("userData"), "config", "catalog-grid.json"))) {
  registerIpcDomain({ registrar, registrations: [
    { kind: "handle", channel: "preferences:getCatalogGrid", listener: () => store.get() },
    { kind: "handle", channel: "preferences:updateCatalogGrid", listener: (_event, scopePath, mode) => store.update(scopePath, mode) }
  ] });
}
