import { useCallback, useEffect, useRef, useState } from "react";
import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";
import type { CatalogAutoKeywordRequest, CatalogAutoKeywordPhase, CatalogAutoKeywordResult } from "../../shared/catalogAutoKeywordTypes";
import { catalogKeywordKey } from "./catalogKeywordIdentity";
import type { CatalogKeywordBatchRequest, CatalogKeywordBatchSource, CatalogKeywordBatchProgress, CatalogKeywordBatchResult } from "../../shared/catalogKeywordBatchTypes";

export interface AutoKeywordJob { key: string; name: string; request: { requestId: string }; phase: CatalogAutoKeywordPhase | "collecting"; cancelling?: boolean; result?: CatalogAutoKeywordResult | CatalogKeywordBatchResult; batch?: boolean; counts?: CatalogKeywordBatchProgress; }
export function useCatalogAutoKeywords() {
  const [job, setJob] = useState<AutoKeywordJob | null>(null);
  const active = useRef<AutoKeywordJob | null>(null), mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = window.cap7ce?.computerSearch.onAutoKeywordProgress?.(progress => {
      const current = active.current;
      if (!current || current.result || current.request.requestId !== progress.requestId) return;
      active.current = { ...current, phase: progress.phase }; setJob(active.current);
    });
    const unsubscribeBatch = window.cap7ce?.computerSearch.onKeywordBatchProgress?.(progress => {
      const current = active.current;
      if (!current?.batch || current.result || current.request.requestId !== progress.requestId) return;
      active.current = { ...current, phase: progress.phase, counts: progress }; setJob(active.current);
    });
    return () => {
      mounted.current = false; unsubscribe?.(); unsubscribeBatch?.();
      if (active.current && !active.current.result) void window.cap7ce?.computerSearch.cancelGeneratedKeywords?.({ requestId: active.current.request.requestId }).catch(() => {});
    };
  }, []);
  const start = useCallback(async (item: ComputerSearchItem, taskId: string) => {
    if (active.current && !active.current.result) return;
    const request: CatalogAutoKeywordRequest = { taskId, authorizationId: item.authorizationId, requestId: `keywords:${crypto.randomUUID()}` };
    const next: AutoKeywordJob = { key: catalogKeywordKey(item), name: item.name, phase: "preparing", request };
    active.current = next; setJob(next);
    let result: CatalogAutoKeywordResult;
    try {
      const generate = window.cap7ce?.computerSearch.generateKeywords;
      if (!generate) throw Error("unavailable");
      result = await generate(request);
    } catch { result = { status: "failed", message: "自动添加关键词失败，请重新选择文件或检查模型配置后重试。" }; }
    if (!mounted.current || active.current?.request.requestId !== next.request.requestId) return;
    active.current = { ...active.current, result }; setJob(active.current);
  }, []);
  const startBatch = useCallback(async (source: CatalogKeywordBatchSource, name: string) => {
    if (active.current && !active.current.result) return;
    const request: CatalogKeywordBatchRequest = { ...source, requestId: `keywords:${crypto.randomUUID()}` };
    const next: AutoKeywordJob = { key: request.requestId, name, request, phase: "collecting", batch: true };
    active.current = next; setJob(next);
    let result: CatalogKeywordBatchResult;
    try { result = await window.cap7ce!.computerSearch.generateKeywordBatch(request); }
    catch { result = { status: "failed", total: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0, message: "无法启动关键词任务，请重新选择文件后重试。" }; }
    if (!mounted.current || active.current?.request.requestId !== request.requestId) return;
    active.current = { ...active.current, result }; setJob(active.current);
  }, []);
  const dismiss = useCallback(() => { if (active.current?.result) { active.current = null; setJob(null); } }, []);
  const cancel = useCallback(() => {
    if (!active.current || active.current.result || active.current.phase === "saving" && !active.current.batch || active.current.cancelling) return;
    active.current = { ...active.current, cancelling: true }; setJob(active.current);
    void window.cap7ce?.computerSearch.cancelGeneratedKeywords?.({ requestId: active.current.request.requestId }).catch(() => {});
  }, []);
  return { job, start, startBatch, dismiss, cancel, busy: !!job && !job.result };
}
