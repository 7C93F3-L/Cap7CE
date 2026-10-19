import fs from "node:fs/promises";
import path from "node:path";
import type { VisualCacheStats } from "../../../src/shared/visualCacheTypes";

export function createOfficePreviewCache(tempRoot: string) {
 if (!path.isAbsolute(tempRoot)) throw Error("core-office-invalid-root");
const officePreviewRoot = path.join(tempRoot, "Cap7CE", "office-preview");
const officePreviewCacheRoot = path.join(officePreviewRoot, "cache");
let generation = 0, operations: Promise<unknown> = Promise.resolve();
const leases = new Map<string, number>();
const enqueue = <T>(run: () => Promise<T>) => {
  const result = operations.then(run, run);
  operations = result.catch(() => undefined);
  return result;
};
const files = async () => {
  try {
    return (await fs.readdir(officePreviewCacheRoot, { withFileTypes: true }))
      .filter(entry => entry.isFile() && /^[a-f0-9]{64}\.pdf$/u.test(entry.name))
      .map(entry => path.join(officePreviewCacheRoot, entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
};
const getOfficePreviewCacheGeneration = () => generation;
const acquireOfficePreviewCache = (file: string, validate: () => Promise<boolean>) => enqueue(async () => {
  if (!await validate()) return null;
  leases.set(file, (leases.get(file) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (leases.get(file) ?? 1) - 1;
    if (remaining) leases.set(file, remaining); else leases.delete(file);
  };
});
const getOfficePreviewCacheStats = async (): Promise<VisualCacheStats> => {
  let cacheCount = 0, totalBytes = 0;
  for (const file of await files()) {
    try { const stat = await fs.stat(file); cacheCount++; totalBytes += stat.size; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return { cacheCount, totalBytes, cachePaths: [officePreviewCacheRoot] };
};
const publishOfficePreviewCache = (source: string, target: string, requestId: number, expectedGeneration: number) => enqueue(async () => {
  if (expectedGeneration !== generation) return;
  if (path.dirname(target) !== officePreviewCacheRoot || !/^[a-f0-9]{64}\.pdf$/u.test(path.basename(target))) throw Error("Invalid Office cache target.");
  const pending = `${target}.${process.pid}.${requestId}.tmp`;
  try { await fs.copyFile(source, pending); await fs.rename(pending, target); }
  catch { await fs.rm(pending, { force: true }).catch(() => undefined); }
});
const clearOfficePreviewCacheFiles = () => {
  generation++;
  return enqueue(async () => {
    for (const file of await files()) if (!leases.has(file)) await fs.rm(file, { force: true });
    return getOfficePreviewCacheStats();
  });
};

 return { officePreviewRoot, officePreviewCacheRoot, getOfficePreviewCacheGeneration, acquireOfficePreviewCache, getOfficePreviewCacheStats, publishOfficePreviewCache, clearOfficePreviewCacheFiles, flush: () => operations };
}
export type OfficePreviewCache = ReturnType<typeof createOfficePreviewCache>;
