import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from "electron";
import type { ComputerSearchRuntime } from "./computerSearchRuntime";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";

export function registerComputerSearchChangeIpc(registrar: IpcRegistrar,
  isSenderAllowed: (event: IpcMainEvent | IpcMainInvokeEvent) => boolean, runtime: ComputerSearchRuntime): void {
  if (!runtime.subscribeCatalogChanges) return;
  const watchers = new Map<WebContents, () => void>();
  registerIpcDomain({ registrar, isSenderAllowed, registrations: [{ kind: "on", channel: "computerSearch:watchCatalog",
    listener(event, enabled) {
      if (typeof enabled !== "boolean") return;
      const sender = event.sender;
      if (!enabled) { watchers.get(sender)?.(); return; }
      if (sender.isDestroyed() || watchers.has(sender) || watchers.size >= 8) return;
      let unsubscribe = () => {};
      const dispose = () => { unsubscribe(); watchers.delete(sender); sender.removeListener("destroyed", dispose); };
      watchers.set(sender, dispose); sender.once("destroyed", dispose);
      try {
        unsubscribe = runtime.subscribeCatalogChanges!(revision => {
          if (sender.isDestroyed()) { dispose(); return; }
          try { sender.send("computerSearch:catalogChanged", revision); } catch { dispose(); }
        });
        if (watchers.get(sender) !== dispose) unsubscribe();
      } catch { dispose(); }
    }
  }] });
}
