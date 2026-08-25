import { t } from "../../../electron/localization";
import type { ThumbnailOptimizationStatus, VisualCacheStats } from "../../shared/types";
import { formatCacheSize } from "../formatting";

export interface CacheSettingsRowsProps {
  cacheOptimizationStatusLabel: string;
  thumbnailOptimizationStatus: ThumbnailOptimizationStatus;
  visualCacheStats: VisualCacheStats;
  skimCacheStats: VisualCacheStats;
  isLoadingCacheStats: boolean;
  isClearingCache: boolean;
  isClearingSkimCache: boolean;
  skimCacheInlineFeedback: string;
  onAutoCacheOptimizationChange: (enabled: boolean) => void;
  onClearCache: () => void;
  onClearSkimCache: () => void;
}

export const CacheSettingsRows = ({
  cacheOptimizationStatusLabel,
  thumbnailOptimizationStatus,
  visualCacheStats,
  skimCacheStats,
  isLoadingCacheStats,
  isClearingCache,
  isClearingSkimCache,
  skimCacheInlineFeedback,
  onAutoCacheOptimizationChange,
  onClearCache,
  onClearSkimCache
}: CacheSettingsRowsProps) => (
  <>
    <div className="cap-settings-row cap-settings-row-cache">
      <span className="cap-settings-label">{t("settings.cacheManagement")}</span>
      <span className="cap-settings-value">
        {cacheOptimizationStatusLabel}
      </span>
      <button
        className="cap-settings-pill"
        type="button"
        title={thumbnailOptimizationStatus.enabled ? t("settings.disableCacheOptimizationHint") : t("settings.enableCacheOptimizationHint")}
        disabled={isClearingCache}
        onClick={() => onAutoCacheOptimizationChange(!thumbnailOptimizationStatus.enabled)}
      >
        {thumbnailOptimizationStatus.enabled ? t("settings.cacheOptimizationOn") : t("settings.cacheOptimizationOff")}
      </button>
      <button className="cap-settings-pill" type="button" onClick={onClearCache} title={t("settings.clearAllCacheActionHint")} disabled={isLoadingCacheStats || isClearingCache || (visualCacheStats.totalBytes === 0 && thumbnailOptimizationStatus.phase !== "running")}>
        {isClearingCache ? t("settings.clearingCache") : t("settings.clearAllCache")}
      </button>
    </div>
    <div className="cap-settings-row">
      <span className="cap-settings-label">{t("settings.skimCache")}</span>
      <span className="cap-settings-value">
        {skimCacheInlineFeedback || t("settings.cacheStats", { count: skimCacheStats.cacheCount, size: formatCacheSize(skimCacheStats.totalBytes) })}
      </span>
      <button
        className="cap-settings-pill"
        type="button"
        onClick={onClearSkimCache}
        title={t("settings.clearSkimCacheActionHint")}
        disabled={isLoadingCacheStats || isClearingSkimCache || skimCacheStats.totalBytes === 0}
      >
        {isClearingSkimCache ? t("settings.clearingCache") : t("settings.clearSkimCache")}
      </button>
    </div>
  </>
);
