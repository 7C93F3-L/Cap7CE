import type { VisualCacheStats } from "./visualCacheService";
import { clearVisualCaches, clearSkimVisualCaches, getVisualCacheStats, getSkimVisualCacheStats } from "./visualCacheService";
import { clearSkimCacheSafely } from "./skimVisualCacheService";
import { clearOfficePreviewCache } from "./officePreviewService";
import { getOfficePreviewCacheStats } from "./officePreviewCache";
import { pauseSearchShellVisualCacheForClear, resumeSearchShellVisualCacheAfterClear } from "./searchShellVisualCacheService";

let clearing: Promise<VisualCacheStats> | null = null;
export const getDisplayCacheStats = async (): Promise<VisualCacheStats> => {
  const groups = await Promise.all([getVisualCacheStats(), getSkimVisualCacheStats(), getOfficePreviewCacheStats()]);
  return { cacheCount: groups.reduce((sum, group) => sum + group.cacheCount, 0),
    totalBytes: groups.reduce((sum, group) => sum + group.totalBytes, 0), cachePaths: [...new Set(groups.flatMap(group => group.cachePaths))] };
};
export const clearDisplayCaches = () => {
  clearing ??= (async () => {
    await pauseSearchShellVisualCacheForClear();
    try {
      return await clearSkimCacheSafely(async () => {
        await clearVisualCaches();
        await clearSkimVisualCaches();
        await clearOfficePreviewCache();
        return getDisplayCacheStats();
      });
    } finally { resumeSearchShellVisualCacheAfterClear(); }
  })().finally(() => { clearing = null; });
  return clearing;
};
