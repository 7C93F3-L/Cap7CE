import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";
import type { ComputerSearchItem } from "./computerSearchTypes";
import type { CatalogKeywordsApi } from "./catalogKeywordsRuntime";

export function registerCatalogKeywordsIpc({ registrar, isSenderAllowed, resolveItem, keywords }: {
  registrar: IpcRegistrar; isSenderAllowed: (event: IpcMainEvent | IpcMainInvokeEvent) => boolean;
  resolveItem: (request: unknown) => ComputerSearchItem; keywords?: CatalogKeywordsApi;
}) {
  const resolve = (value: unknown) => {
    if (!keywords) throw Error("catalog-keywords-unavailable");
    const item = resolveItem(value);
    if (item.isDirectory) throw Error("catalog-keywords-invalid-file");
    return item;
  };
  registerIpcDomain({ registrar, isSenderAllowed, registrations: [
    { kind: "handle", channel: "computerSearch:readKeywords", listener: async (_event, value) => {
      resolve(value); await keywords!.prepare();
      const result = await keywords!.read(resolve(value)); resolve(value); return result;
    } },
    { kind: "handle", channel: "computerSearch:saveKeywords", listener: async (_event, value) => {
      resolve(value);
      const request = value as { keywords: unknown; expectedRevision: unknown };
      if (!Array.isArray(request.keywords) || request.keywords.length > 128 || request.keywords.some(word => typeof word !== "string" || word.length > 256 || word.includes("\0"))
        || (request.expectedRevision !== null && (typeof request.expectedRevision !== "string" || !/^\d{1,19}$/.test(request.expectedRevision)))) throw Error("catalog-keywords-invalid-request");
      const words = [...request.keywords] as string[], revision = request.expectedRevision as string | null;
      await keywords!.prepare(); return keywords!.write(resolve(value), words, revision);
    } }
  ] });
}
