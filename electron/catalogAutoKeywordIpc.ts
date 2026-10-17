import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";
import type { ComputerSearchItem } from "./computerSearchTypes";
import type { CatalogKeywordsApi } from "./catalogKeywordsRuntime";
import type { CatalogAutoKeywordService } from "./catalogAutoKeywordService";
import type { CatalogAutoKeywordResult } from "../src/shared/catalogAutoKeywordTypes";
import type { ComputerSearchRuntime } from "./computerSearchRuntime";
import type { CatalogKeywordBatchRequest, CatalogKeywordBatchResult } from "../src/shared/catalogKeywordBatchTypes";
import { collectKeywordBatchTargets } from "./catalogKeywordBatchTargets";
import { runKeywordBatch } from "./catalogKeywordBatchService";
import { createKeywordJobOwner } from "./catalogKeywordJobOwner";

const requestId = (value: unknown) => {
  const id = (value as { requestId?: unknown })?.requestId;
  if (typeof id !== "string" || !/^[A-Za-z0-9:_-]{1,128}$/u.test(id)) throw Error("catalog-auto-keywords-invalid-request");
  return id;
};
export function registerCatalogAutoKeywordIpc({ registrar, isSenderAllowed, resolveItem, keywords, createService, runtime, resolveItems }: {
  registrar: IpcRegistrar; isSenderAllowed: (event: IpcMainEvent | IpcMainInvokeEvent) => boolean;
  resolveItem: (value: unknown) => ComputerSearchItem; keywords?: CatalogKeywordsApi;
  createService?: () => Promise<CatalogAutoKeywordService>;
  runtime?: ComputerSearchRuntime; resolveItems?: (value: unknown) => ComputerSearchItem[];
}) {
  const owner = createKeywordJobOwner();
  const service = () => createService ? createService() : import("./catalogAutoKeywordRuntime").then(module => module.createCatalogAutoKeywordRuntime(keywords!));
  registerIpcDomain({ registrar, isSenderAllowed, registrations: [
    { kind: "handle", channel: "computerSearch:generateKeywords", listener: async (event, value): Promise<CatalogAutoKeywordResult> => {
      const id = requestId(value); resolveItem(value);
      if (!keywords) return { status: "failed", message: "关键词保存服务暂不可用，请重试。" };
      return owner.run<CatalogAutoKeywordResult>(event, id, false, { status: "failed", message: "正在处理另一项关键词任务，请稍后再试。" }, async (signal, update) => {
        try {
          const item = { ...resolveItem(value) }, run = await service();
          return await run(() => item, signal, phase => {
            update(phase);
            if (!event.sender.isDestroyed()) event.sender.send("computerSearch:autoKeywordProgress", { requestId: id, phase });
          });
        } catch { return { status: "failed", message: "自动添加关键词失败，请检查本地模型配置后重试。" }; }
      });
    } },
    { kind: "handle", channel: "computerSearch:generateKeywordBatch", listener: async (event, value): Promise<CatalogKeywordBatchResult> => {
      const id = requestId(value), source = value as CatalogKeywordBatchRequest;
      const selected = "authorizationIds" in source ? resolveItems?.(source).map(item => ({ ...item })) : null;
      const failure: CatalogKeywordBatchResult = { status: "failed", total: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0, message: "关键词服务不可用或已有任务正在处理，请稍后重试。" };
      if (!runtime || !resolveItems || !keywords) return failure;
      return owner.run(event, id, true, failure, async (signal, update) => {
        const progress = (p: Omit<import("../src/shared/catalogKeywordBatchTypes").CatalogKeywordBatchProgress, "requestId">) => {
          update(p.phase); if (!event.sender.isDestroyed()) event.sender.send("computerSearch:keywordBatchProgress", { ...p, requestId: id });
        };
        const collect = () => collectKeywordBatchTargets(runtime, source, () => selected!, signal, total => progress({ total, processed: 0, succeeded: 0, failed: 0, skipped: 0, phase: "collecting", name: "" }));
        try { return await runKeywordBatch(collect, await service(), signal, progress); }
        catch { return failure; }
      });
    } },
    { kind: "handle", channel: "computerSearch:cancelGeneratedKeywords", listener: (event, value) => {
      return owner.cancel(event, requestId(value));
    } }
  ] });
}
