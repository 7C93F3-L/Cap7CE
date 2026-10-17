import type { CatalogAutoKeywordService } from "./catalogAutoKeywordService";
import type { CatalogKeywordBatchCounts, CatalogKeywordBatchProgress, CatalogKeywordBatchResult } from "../src/shared/catalogKeywordBatchTypes";
import { getFileFormatCapability } from "./formatCapabilities";
import type { KeywordBatchTargets } from "./catalogKeywordBatchTargets";

export async function runKeywordBatch(collect: () => Promise<KeywordBatchTargets>, run: CatalogAutoKeywordService,
  signal: AbortSignal, progress: (value: Omit<CatalogKeywordBatchProgress, "requestId">) => void): Promise<CatalogKeywordBatchResult> {
  const counts: CatalogKeywordBatchCounts = { total: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  let message: string | undefined;
  try {
    const { items, failed, skipped, message: collectionMessage } = await collect();
    counts.failed = failed; counts.skipped = skipped; counts.processed = failed + skipped; counts.total = items.length + counts.processed; message = collectionMessage;
    for (const item of items) {
      if (signal.aborted) return { ...counts, status: "cancelled" };
      if (item.isDirectory || !getFileFormatCapability(item.extension)?.canAIIndex) { counts.skipped++; counts.processed++; continue; }
      const result = await run(() => item, signal, phase => progress({ ...counts, name: item.name, phase }));
      if (result.status === "cancelled") return { ...counts, status: "cancelled" };
      counts.processed++;
      if (result.status === "saved") counts.succeeded++;
      else { counts.failed++; message ??= result.message; if (result.fatal) return { ...counts, status: "failed", message: result.message }; }
      progress({ ...counts, name: item.name, phase: "preparing" });
    }
    return { ...counts, status: "completed", ...(message ? { message } : {}) };
  } catch (error) {
    return { ...counts, status: signal.aborted ? "cancelled" : "failed", message: signal.aborted ? undefined : error instanceof Error && /[\u4e00-\u9fff]/u.test(error.message) ? error.message.slice(0, 240) : "无法读取所选目录或文件列表，请确认目录已入库且仍可访问后重试。" };
  }
}
