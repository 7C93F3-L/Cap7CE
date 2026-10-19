import { randomUUID } from "node:crypto";
import { parseGeneratedKeywords } from "./localKeywordPolicy";
import type { LocalKeywordModelConnection } from "../../src/shared/localKeywordTypes";
import type { CoreNodeTransport } from "../../src/shared/coreNodeTransport";
export async function generateCoreKeywords(connection: LocalKeywordModelConnection, dataUrl: string, signal: AbortSignal,
  timeoutMs: number, injected?: CoreNodeTransport): Promise<string[]> {
  const target = { baseUrl: connection.baseUrl, modelName: connection.modelName };
  const id = randomUUID(); let cancelled = false, timedOut = false, sent = false, transport: CoreNodeTransport | undefined;
  let rejectAbort: (error: Error) => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const error = () => new Error(timedOut ? "关键词生成超时，请重试。" : "cancelled");
  const cancel = () => {
    if (cancelled) return; cancelled = true; rejectAbort(error());
    if (sent) void transport!.cancel("localKeywords.cancel", [id]).catch(() => undefined);
  };
  const timer = setTimeout(() => { timedOut = true; cancel(); }, timeoutMs);
  signal.addEventListener("abort", cancel, { once: true }); if (signal.aborted) cancel();
  const operation = Promise.resolve().then(async () => {
    if (cancelled) throw error();
    if (injected) transport = injected;
    else {
      const service = await import("../visualCacheService");
      transport = { request: service.requestVisualCacheOwner, cancel: service.requestActiveVisualCacheOwner };
    }
    if (cancelled) throw error(); sent = true;
    const value = await transport.request("localKeywords.generate", [id, target, dataUrl, timeoutMs]);
    if (!Array.isArray(value) || value.length > 20) throw new Error("模型未返回有效关键词，请重试。");
    return parseGeneratedKeywords(JSON.stringify(value));
  });
  try { return await Promise.race([operation, aborted]); }
  finally { clearTimeout(timer); signal.removeEventListener("abort", cancel); }
}
