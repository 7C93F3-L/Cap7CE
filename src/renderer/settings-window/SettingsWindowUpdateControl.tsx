import { useEffect, useState } from "react";
import { t } from "../../../electron/localization";
import type { AppUpdateDownloadErrorCode, AppUpdateDownloadProgress, AppUpdatePublicState } from "../../../electron/appUpdateTypes";
import { getUpdatePrimaryLabel, getUpdateStatusLabel, isUpdateActionDisabled, type UpdateStatus } from "./settingsWindowUpdatePresentation";

interface SettingsWindowUpdateControlProps {
  requestConfirmation: (message: string, action: () => Promise<unknown>) => void;
}

const statusFromPublicState = (state: AppUpdatePublicState): UpdateStatus => state.status;

export const SettingsWindowUpdateControl = ({ requestConfirmation }: SettingsWindowUpdateControlProps) => {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [version, setVersion] = useState("1.0.1");
  const [failureReason, setFailureReason] = useState<AppUpdateDownloadErrorCode | null>(null);
  const [progress, setProgress] = useState<Pick<AppUpdateDownloadProgress, "receivedBytes" | "totalBytes" | "percent"> | null>(null);

  const applyPublicState = (state: AppUpdatePublicState) => {
    if (state.version) setVersion(state.version);
    if (state.receivedBytes !== undefined && state.totalBytes !== undefined && state.percent !== undefined) {
      setProgress({ receivedBytes: state.receivedBytes, totalBytes: state.totalBytes, percent: state.percent });
    }
    setStatus(statusFromPublicState(state));
  };

  useEffect(() => {
    void window.cap7ce?.app.getUpdateState().then(applyPublicState);
    return window.cap7ce?.app.onUpdateDownloadProgress((nextProgress) => {
      setProgress(nextProgress);
      setStatus(nextProgress.phase);
    });
  }, []);

  const check = async () => {
    setStatus("checking");
    setFailureReason(null);
    try {
      const result = await window.cap7ce?.app.checkForUpdates();
      if (!result) return setStatus("failed");
      setVersion(result.latestVersion || result.currentVersion);
      if (result.downloadState.status === "resumable" || result.downloadState.status === "ready") {
        applyPublicState(result.downloadState);
      } else {
        setStatus(result.status);
      }
    } catch {
      setStatus("failed");
    }
  };

  const download = async () => {
    setStatus("downloading");
    setFailureReason(null);
    try {
      const result = await window.cap7ce?.app.downloadUpdate();
      if (!result) return setStatus("download_failed");
      if (result.version) setVersion(result.version);
      if (result.status === "failed") {
        setFailureReason(result.reason ?? null);
        if ((result.receivedBytes ?? 0) > 0) {
          setProgress({ receivedBytes: result.receivedBytes ?? 0, totalBytes: result.totalBytes ?? 0, percent: result.percent ?? 0 });
          setStatus("resumable");
        } else {
          setStatus("download_failed");
        }
      } else if (result.status === "paused") {
        setStatus("resumable");
      } else if (result.status === "busy") {
        setStatus("downloading");
      } else {
        setStatus(result.status);
      }
    } catch {
      setStatus("download_failed");
    }
  };

  const pause = async () => {
    setStatus("pausing");
    const paused = await window.cap7ce?.app.pauseUpdateDownload();
    if (!paused) setStatus("downloading");
  };

  const discard = async () => {
    setStatus("discarding");
    const discarded = await window.cap7ce?.app.discardUpdate();
    setProgress(null);
    setFailureReason(null);
    setStatus(discarded ? "idle" : "download_failed");
  };

  const install = async () => {
    setStatus("installing");
    const result = await window.cap7ce?.app.installUpdate();
    if (!result || result.status === "failed") {
      setFailureReason(result?.reason ?? "unknown");
      setStatus(result?.reason === "invalid" ? "download_failed" : "install_failed");
    }
  };

  const statusLabel = getUpdateStatusLabel(status, version, progress, failureReason);

  const primaryAction = status === "update_available" || status === "resumable" || status === "download_failed"
    ? download
    : status === "downloading"
      ? pause
      : status === "ready" || status === "install_failed"
        ? () => requestConfirmation(t("settings.confirmInstallUpdate"), install)
        : check;
  const primaryLabel = getUpdatePrimaryLabel(status);
  const disabled = isUpdateActionDisabled(status);

  return (
    <div className="cap-stable-settings-action-line">
      <span>{statusLabel}</span>
      <div className="cap-stable-settings-model-actions">
        {(status === "resumable" || status === "ready" || status === "install_failed") && <button type="button" className="cap-stable-settings-button" onClick={() => requestConfirmation(t("settings.confirmDiscardUpdate"), discard)}>{t("settings.discardUpdate")}</button>}
        <button type="button" className="cap-stable-settings-button" disabled={disabled} onClick={() => void primaryAction()}>{primaryLabel}</button>
      </div>
    </div>
  );
};
