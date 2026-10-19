import { requestCoreOfficePreview } from "./core/coreOfficePreviewHost";
import { officePreviewCacheRoot } from "./officePreviewPaths";
import type { VisualCacheStats } from "../src/shared/visualCacheTypes";
export { officePreviewRoot, officePreviewCacheRoot } from "./officePreviewPaths";
const stats = (value: unknown): VisualCacheStats => { const result = value as VisualCacheStats;
 if (!result || !Number.isSafeInteger(result.cacheCount) || result.cacheCount < 0 || !Number.isSafeInteger(result.totalBytes) || result.totalBytes < 0 || !Array.isArray(result.cachePaths) || result.cachePaths.length !== 1 || result.cachePaths[0] !== officePreviewCacheRoot) throw Error("core-office-invalid-response"); return result; };
export const getOfficePreviewCacheStats = async () => stats(await requestCoreOfficePreview("cache.stats", []));
export const clearOfficePreviewCacheFiles = async () => stats(await requestCoreOfficePreview("cache.clear", []));
export const acquireOfficePreviewCache = async (file: string, validate?: () => Promise<boolean>) => {
 if (validate && !await validate()) return null; const token = await requestCoreOfficePreview("cache.acquire", [file]);
 if (token === null) return null; if (typeof token !== "string" || !/^[a-f0-9-]{36}$/.test(token)) throw Error("core-office-invalid-response"); let released = false;
 return () => { if (released) return; released = true; void requestCoreOfficePreview("cache.release", [token], true).catch(() => undefined); };
};
