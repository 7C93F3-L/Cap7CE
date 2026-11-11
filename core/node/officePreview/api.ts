import { PreviewIdleGuard } from "../providerPreview/idle"; import path from "node:path";
import { randomUUID } from "node:crypto";
import { createOfficePreviewCache } from "./cache";
import { createOfficePreviewService } from "./sessions";
import { isValidPdf } from "./pdfHeader"; import { releasePreviewWorkers } from "../providerPreview/lifecycle"; import type { OfficeConversionRunner } from "./conversion";
export function createOfficePreviewOwner(tempRoot: string, runner?: OfficeConversionRunner) {
  const cache = createOfficePreviewCache(tempRoot), service = createOfficePreviewService(cache, runner), leases = new Map<string, () => void>(), pending = new Set<Promise<unknown>>();
  const idle = new PreviewIdleGuard();
  let closed = false, releasing: Promise<void> | undefined;
  const invalid = (): never => { throw Error("core-office-invalid-request"); };
  const text = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 32767 && !value.includes("\0") ? value : invalid();
  const file = (value: unknown) => { const result = text(value); return path.isAbsolute(result) ? result : invalid(); };
  const release = () => releasing ??= (async () => { service.closeOfficePreviewSession(); await releasePreviewWorkers(); await Promise.allSettled([...pending]); await releasePreviewWorkers(); await service.flush(); await cache.flush(); })().finally(() => { releasing = undefined; });
  const execute = async (method: string, args: unknown[]): Promise<unknown> => {
    if (method === "office.open") { if (args.length !== 2) return invalid(); return service.openOfficePreviewSession(text(args[0]), file(args[1])); }
    if (method === "office.close") { if (args.length !== 1) return invalid(); return service.closeOfficePreviewSession(text(args[0])); }
    if (method === "office.prepare") { if (args.length) return invalid(); return service.prepareOfficePreviewTemporaryRoot(); }
    if (method === "cache.stats") { if (args.length) return invalid(); return cache.getOfficePreviewCacheStats(); }
    if (method === "cache.clear") { if (args.length) return invalid(); return cache.clearOfficePreviewCacheFiles(); }
    if (method === "cache.acquire") {
      if (args.length !== 1 || leases.size >= 64) return invalid(); const target = file(args[0]);
      if (path.dirname(target) !== cache.officePreviewCacheRoot || !/^[a-f0-9]{64}\.pdf$/.test(path.basename(target))) return invalid();
      const unlock = await cache.acquireOfficePreviewCache(target, () => isValidPdf(target)); if (!unlock) return null;
      const token = randomUUID(); leases.set(token, unlock); return token;
    }
    if (method === "cache.release") { if (args.length !== 1) return invalid(); const token = text(args[0]), unlock = leases.get(token); leases.delete(token); unlock?.(); return !!unlock; }
    return invalid();
  };
  return {
    async dispatch(method: unknown, args: unknown): Promise<unknown> {
      if (closed || typeof method !== "string" || !Array.isArray(args)) return invalid();
      if (method === "preview.idle") { if (args.length) return invalid(); if (releasing || !(idle.idle && leases.size === 0)) return false; await release(); return true; }
      if (method === "releaseSourceHandles") { if (args.length) return invalid(); return release(); }
      if (releasing || pending.size >= 16) throw Error("core-office-busy");
      const work = idle.run(method, args, () => execute(method, args)); pending.add(work); try { return await work; } finally { pending.delete(work); }
    },
    async close() { closed = true; for (const unlock of leases.values()) unlock(); leases.clear(); await release(); }
  };
}
