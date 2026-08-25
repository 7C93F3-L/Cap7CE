import { useEffect, useRef, useState } from "react";
import { t } from "../../../electron/localization";
import type { EmbeddedMetadataTaskStatus } from "../../shared/types";

const initialStatus: EmbeddedMetadataTaskStatus = {
  phase: "idle",
  totalCount: 0,
  queuedCount: 0,
  processedCount: 0,
  indexedCount: 0,
  emptyCount: 0,
  failedCount: 0,
  activeDurationMs: 0
};

export const EmbeddedMetadataSettingsRow = () => {
  const [status, setStatus] = useState(initialStatus);
  const [isCompleteNoticeVisible, setIsCompleteNoticeVisible] = useState(false);
  const completeNoticeTimerRef = useRef<number | null>(null);
  const api = window.cap7ce?.embeddedMetadata;
  const isRunning = status.phase === "running" || status.phase === "cancelling";
  const canContinue = status.phase === "cancelled" || status.phase === "failed";

  useEffect(() => {
    if (!api) return;
    let active = true;
    void api.status().then((value) => { if (active) setStatus(value); });
    const unsubscribe = api.onStatusChanged((value) => { if (active) setStatus(value); });
    return () => {
      active = false;
      unsubscribe();
      if (completeNoticeTimerRef.current !== null) window.clearTimeout(completeNoticeTimerRef.current);
    };
  }, [api]);

  const statusText = isRunning
    ? t("settings.embeddedMetadataProgress", {
      processed: status.processedCount,
      total: status.totalCount,
      failed: status.failedCount
    })
    : status.phase === "cancelled"
      ? t("settings.embeddedMetadataStopped", {
        processed: status.processedCount,
        total: status.totalCount
      })
      : status.phase === "failed"
        ? t("settings.embeddedMetadataFailed", { failed: status.failedCount })
        : isCompleteNoticeVisible
          ? t("settings.embeddedMetadataComplete")
          : "";

  const actionText = isRunning
    ? t("settings.embeddedMetadataStop")
    : canContinue
      ? t("settings.embeddedMetadataContinue")
      : t("settings.embeddedMetadataCheck");
  const actionHint = isRunning
    ? t("settings.embeddedMetadataStopHint")
    : t("settings.embeddedMetadataCheckHint");

  return (
    <div className="cap-settings-row">
      <span className="cap-settings-label">{t("settings.embeddedMetadata")}</span>
      {statusText ? <span className="cap-settings-value">{statusText}</span> : null}
      <button
        className="cap-settings-pill"
        type="button"
        title={actionHint}
        disabled={!api || status.phase === "cancelling"}
        onClick={() => {
          if (!api) return;
          if (isRunning) void api.cancelBackfill();
          else void api.startBackfill().then((value) => {
            setStatus(value);
            if (value.totalCount !== 0) return;
            setIsCompleteNoticeVisible(true);
            if (completeNoticeTimerRef.current !== null) window.clearTimeout(completeNoticeTimerRef.current);
            completeNoticeTimerRef.current = window.setTimeout(() => {
              setIsCompleteNoticeVisible(false);
              completeNoticeTimerRef.current = null;
            }, 2000);
          });
        }}
      >
        {actionText}
      </button>
    </div>
  );
};
