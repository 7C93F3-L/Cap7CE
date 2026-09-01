import { useEffect, useState } from "react";
import { t } from "../../../electron/localization";
import { formatCacheSize } from "../formatting";

type UpdateStatus = "idle" | "checking" | "up_to_date" | "update_available" | "downloading" | "cancelling" | "cancelled" | "installing" | "unsupported" | "failed" | "download_failed";

export const SettingsWindowUpdateControl = () => {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [version, setVersion] = useState("");
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ receivedBytes: number; totalBytes: number | null; percent: number | null } | null>(null);

  useEffect(() => window.cap7ce?.app.onUpdateDownloadProgress((nextProgress) => {
    setProgress(nextProgress);
    setStatus(nextProgress.completed ? "installing" : "downloading");
  }), []);

  const check = async () => {
    setStatus("checking");
    setFailureReason(null);
    try {
      const result = await window.cap7ce?.app.checkForUpdates();
      if (!result) {
        setStatus("failed");
        return;
      }
      setVersion(result.latestVersion || result.currentVersion);
      setStatus(result.status);
    } catch {
      setStatus("failed");
    }
  };

  const download = async () => {
    setStatus("downloading");
    setFailureReason(null);
    setProgress(null);
    try {
      const result = await window.cap7ce?.app.downloadUpdate();
      if (!result) {
        setStatus("download_failed");
        return;
      }
      if (result.version) setVersion(result.version);
      if (result.status === "failed") {
        setFailureReason(result.reason ?? null);
        setStatus(result.reason === "cancelled" ? "cancelled" : "download_failed");
        return;
      }
      setStatus(result.status === "busy" ? "downloading" : result.status);
    } catch {
      setStatus("download_failed");
    }
  };

  const cancel = async () => {
    setStatus("cancelling");
    const cancelled = await window.cap7ce?.app.cancelUpdateDownload();
    setStatus(cancelled ? "cancelled" : "downloading");
  };

  const reasonKey = failureReason === "rate_limited"
    ? "settings.updateRateLimited"
    : failureReason === "network"
      ? "settings.updateNetworkFailed"
      : failureReason === "disk_space"
        ? "settings.updateDiskSpaceFailed"
        : failureReason === "security"
          ? "settings.updateSecurityFailed"
          : failureReason === "incomplete"
            ? "settings.updateIncomplete"
            : failureReason === "invalid"
              ? "settings.updateInvalid"
              : "settings.updateDownloadFailed";
  const statusLabel = status === "checking"
    ? t("settings.updateChecking")
    : status === "up_to_date"
      ? t("settings.updateUpToDate", { version })
      : status === "update_available"
        ? t("settings.updateAvailable", { version })
        : status === "downloading"
          ? progress?.totalBytes
            ? t("settings.updateDownloading", {
              percent: Math.round(progress.percent ?? 0),
              received: formatCacheSize(progress.receivedBytes),
              total: formatCacheSize(progress.totalBytes)
            })
            : t("settings.updateDownloadingUnknownTotal", { received: formatCacheSize(progress?.receivedBytes ?? 0) })
          : status === "cancelling"
            ? t("settings.updateCancelling")
            : status === "cancelled"
              ? t("settings.updateCancelled")
              : status === "installing"
                ? t("settings.updateInstalling")
                : status === "unsupported"
                  ? t("settings.updateUnsupported")
                  : status === "download_failed"
                    ? t(reasonKey)
                    : status === "failed"
                      ? t("settings.updateCheckFailed")
                      : t("settings.updateNotChecked");

  const action = status === "update_available"
    ? download
    : status === "downloading"
      ? cancel
      : check;
  const actionLabel = status === "checking"
    ? t("settings.updateCheckingButton")
    : status === "downloading"
      ? t("common.cancel")
      : status === "cancelling"
        ? t("settings.updateCancellingButton")
        : status === "installing"
          ? t("settings.updateInstallingButton")
          : status === "update_available"
            ? t("settings.downloadUpdateNow")
            : t("settings.checkForUpdates");

  return (
    <div className="cap-stable-settings-action-line">
      <span>{statusLabel}</span>
      <button
        type="button"
        className="cap-stable-settings-button"
        disabled={status === "checking" || status === "cancelling" || status === "installing"}
        onClick={() => void action()}
      >
        {actionLabel}
      </button>
    </div>
  );
};
