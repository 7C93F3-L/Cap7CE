import { t } from "../../electron/localization";
import type { ThumbnailOptimizationStatus } from "../shared/types";

export const formatCacheSize = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
};

export const formatThumbnailOptimizationStatus = (status: ThumbnailOptimizationStatus) => {
  if (status.phase === "discovering") return t("stableSettings.optimizationChecking");
  if (status.phase !== "completed") return t("stableSettings.optimizationSummary", {
    queued: status.queuedCount,
    processed: status.processedCount,
    failed: status.failedCount
  });
  if (status.processedCount === 0 && status.failedCount === 0) return t("stableSettings.optimizationNoWork");
  return t("stableSettings.optimizationCompleted", { processed: status.processedCount, failed: status.failedCount });
};

export const formatDisplayMessage = (message?: string) => {
  if (!message) {
    return "";
  }

  return message.replace(/fetch\s*failed/gi, t("error.connectionFailed"));
};
