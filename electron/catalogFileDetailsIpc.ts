import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";
import { createCatalogFileDetailsReader } from "./catalogFileDetailsReader";
import type { ComputerSearchItem } from "./computerSearchTypes";
import type { SkimPreviewInfo } from "./skimPreviewService";

const readKey = (value: unknown) => {
  if (!value || typeof value !== "object" || !("requestId" in value)
    || typeof value.requestId !== "string" || !/^[A-Za-z0-9:_-]{1,128}$/.test(value.requestId)) throw Error("computer-search-invalid-details-request");
  return value.requestId;
};
export function registerCatalogFileDetailsIpc({ registrar, isSenderAllowed, resolveItem, inspectItem }: {
  registrar: IpcRegistrar; isSenderAllowed: (event: IpcMainEvent | IpcMainInvokeEvent) => boolean;
  resolveItem: (value: unknown) => ComputerSearchItem;
  inspectItem: (filePath: string, kind: "file" | "folder") => Promise<SkimPreviewInfo>;
}) {
  const reader = createCatalogFileDetailsReader({ inspect: filePath => inspectItem(filePath, "file") });
  registerIpcDomain({ registrar, isSenderAllowed, registrations: [
    { kind: "handle", channel: "computerSearch:readFileDetails", listener: async (_event, value) => {
      const key = readKey(value), item = resolveItem(value);
      if (item.isDirectory) return null;
      const result = await reader.read(key, item.path);
      try { return resolveItem(value).path === item.path ? result : null; } catch { return null; }
    } },
    { kind: "handle", channel: "computerSearch:cancelFileDetails", listener: (_event, value) => { reader.cancel(readKey(value)); return true; } }
  ] });
}
