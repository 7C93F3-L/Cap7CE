import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";
import type { ComputerSearchItem } from "./computerSearchTypes";
import type { CatalogKeywordsApi } from "./catalogKeywordsRuntime";
import type { CatalogAutoKeywordService } from "./catalogAutoKeywordService";
import type { CatalogAutoKeywordPhase, CatalogAutoKeywordResult } from "../src/shared/catalogAutoKeywordTypes";

const requestId = (value: unknown) => {
  const id = (value as { requestId?: unknown })?.requestId;
  if (typeof id !== "string" || !/^[A-Za-z0-9:_-]{1,128}$/u.test(id)) throw Error("catalog-auto-keywords-invalid-request");
  return id;
};
export function registerCatalogAutoKeywordIpc({ registrar, isSenderAllowed, resolveItem, keywords, createService }: {
  registrar: IpcRegistrar; isSenderAllowed: (event: IpcMainEvent | IpcMainInvokeEvent) => boolean;
  resolveItem: (value: unknown) => ComputerSearchItem; keywords?: CatalogKeywordsApi;
  createService?: () => Promise<CatalogAutoKeywordService>;
}) {
  let active: { id: string; sender: number; controller: AbortController; phase: CatalogAutoKeywordPhase } | null = null;
  registerIpcDomain({ registrar, isSenderAllowed, registrations: [
    { kind: "handle", channel: "computerSearch:generateKeywords", listener: async (event, value): Promise<CatalogAutoKeywordResult> => {
      const id = requestId(value); resolveItem(value);
      if (!keywords) return { status: "failed", message: "关键词保存服务暂不可用，请重试。" };
      if (active) return { status: "failed", message: "正在处理另一张图片，请稍后再试。" };
      const job = { id, sender: event.sender.id, controller: new AbortController(), phase: "preparing" as CatalogAutoKeywordPhase };
      active = job;
      const destroyed = () => job.controller.abort();
      event.sender.once("destroyed", destroyed);
      try {
        const run = await (createService ? createService() : import("./catalogAutoKeywordRuntime").then(module => module.createCatalogAutoKeywordRuntime(keywords)));
        return await run(() => resolveItem(value), job.controller.signal, phase => {
          job.phase = phase;
          if (!event.sender.isDestroyed()) event.sender.send("computerSearch:autoKeywordProgress", { requestId: id, phase });
        });
      } catch { return { status: "failed", message: "自动添加关键词失败，请检查本地模型配置后重试。" }; }
      finally { event.sender.removeListener("destroyed", destroyed); if (active === job) active = null; }
    } },
    { kind: "handle", channel: "computerSearch:cancelGeneratedKeywords", listener: (event, value) => {
      if (!active || active.id !== requestId(value) || active.sender !== event.sender.id || active.phase === "saving") return false;
      active.controller.abort(); return true;
    } }
  ] });
}
