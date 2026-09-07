import { t } from "../../../electron/localization";
import type { AppUpdateDownloadErrorCode, AppUpdateDownloadProgress } from "../../../electron/appUpdateTypes";
import { formatCacheSize } from "../formatting";

export type UpdateStatus = "idle" | "checking" | "up_to_date" | "update_available" | "downloading" | "pausing" | "resumable" | "verifying" | "ready" | "discarding" | "installing" | "install_failed" | "unsupported" | "failed" | "download_failed";

type UpdateProgress = Pick<AppUpdateDownloadProgress, "receivedBytes" | "totalBytes" | "percent"> | null;

const failureTranslationKey = (reason: AppUpdateDownloadErrorCode | null) => (
  reason === "rate_limited"
    ? "settings.updateRateLimited"
    : reason === "network"
      ? "settings.updateNetworkFailed"
      : reason === "disk_space"
        ? "settings.updateDiskSpaceFailed"
        : reason === "security"
          ? "settings.updateSecurityFailed"
          : reason === "incomplete"
            ? "settings.updateIncomplete"
            : reason === "invalid"
              ? "settings.updateInvalid"
              : "settings.updateDownloadFailed"
);

export const getUpdateStatusLabel = (status: UpdateStatus, version: string, progress: UpdateProgress, failureReason: AppUpdateDownloadErrorCode | null): string => {
  if (status === "checking") return t("settings.updateChecking");
  if (status === "up_to_date") return t("settings.updateUpToDate", { version });
  if (status === "update_available") return t("settings.updateAvailable", { version });
  if (status === "downloading" || status === "pausing") return t("settings.updateDownloading", {
    percent: Math.round(progress?.percent ?? 0),
    received: formatCacheSize(progress?.receivedBytes ?? 0),
    total: formatCacheSize(progress?.totalBytes ?? 0)
  });
  if (status === "resumable") return failureReason ? t(failureTranslationKey(failureReason)) : t("settings.updatePaused", { version });
  if (status === "verifying") return t("settings.updateVerifying");
  if (status === "ready") return t("settings.updateReady", { version });
  if (status === "discarding") return t("settings.updateDiscarding");
  if (status === "installing") return t("settings.updateInstalling");
  if (status === "install_failed") return t("settings.updateInstallerOpenFailed");
  if (status === "unsupported") return t("settings.updateUnsupported");
  if (status === "download_failed") return t(failureTranslationKey(failureReason));
  if (status === "failed") return t("settings.updateCheckFailed");
  return t("settings.updateCurrentVersion", { version });
};

export const getUpdatePrimaryLabel = (status: UpdateStatus): string => {
  if (status === "checking") return t("settings.updateCheckingButton");
  if (status === "downloading") return t("settings.pauseUpdate");
  if (status === "pausing") return t("settings.updatePausing");
  if (status === "resumable") return t("settings.resumeUpdate");
  if (status === "verifying") return t("settings.updateVerifyingButton");
  if (status === "ready" || status === "install_failed") return t("settings.installUpdateNow");
  if (status === "installing") return t("settings.updateInstallingButton");
  if (status === "update_available") return t("settings.downloadUpdateNow");
  if (status === "download_failed") return t("settings.downloadUpdateAgain");
  return t("settings.checkForUpdates");
};

export const isUpdateActionDisabled = (status: UpdateStatus): boolean => (
  status === "checking" || status === "pausing" || status === "verifying" || status === "discarding" || status === "installing"
);
