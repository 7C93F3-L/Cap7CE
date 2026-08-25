import { useEffect, useState } from "react";
import { t } from "../../../electron/localization";
import type { RuntimeDiagnosticsInfo } from "../../shared/types";

export const RuntimeDiagnosticsRows = () => {
  const [info, setInfo] = useState<RuntimeDiagnosticsInfo | null>(null);
  const [busyAction, setBusyAction] = useState<"detail" | "export" | null>(null);
  const [status, setStatus] = useState<"idle" | "exported" | "failed">("idle");

  useEffect(() => {
    let active = true;
    void window.cap7ce?.diagnostics?.getInfo()
      .then((nextInfo) => {
        if (active) setInfo(nextInfo);
      })
      .catch(() => {
        if (active) setStatus("failed");
      });
    return () => {
      active = false;
    };
  }, []);

  const toggleDetailedLogging = async () => {
    if (!info || busyAction) return;
    setBusyAction("detail");
    setStatus("idle");
    try {
      const nextInfo = await window.cap7ce?.diagnostics?.setDetailedLogging(!info.detailedLoggingEnabled);
      if (nextInfo) setInfo(nextInfo);
    } catch {
      setStatus("failed");
    } finally {
      setBusyAction(null);
    }
  };

  const exportDiagnostics = async () => {
    if (busyAction) return;
    setBusyAction("export");
    setStatus("idle");
    try {
      const result = await window.cap7ce?.diagnostics?.export();
      if (result?.status === "exported") setStatus("exported");
      if (result?.status === "failed") setStatus("failed");
    } catch {
      setStatus("failed");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <>
      <span className="runtime-diagnostics-group">Cap7CE</span>
      <span>{t("settings.applicationLog")}</span>
      <strong className="runtime-diagnostics-path">{info?.logDirectory || t("common.notCreated")}</strong>
      <span>{t("settings.crashReports")}</span>
      <strong className="runtime-diagnostics-path">{info?.crashDirectory || t("common.notCreated")}</strong>
      <span>{t("settings.detailedLogging")}</span>
      <strong className="runtime-diagnostics-action">
        <span>{info?.detailedLoggingEnabled ? t("common.enabled") : t("common.disabled")}</span>
        <button className="cap-settings-pill" type="button" onClick={toggleDetailedLogging} title={info?.detailedLoggingEnabled ? t("settings.disableDetailedLoggingHint") : t("settings.enableDetailedLoggingHint")} disabled={!info || busyAction !== null}>
          {info?.detailedLoggingEnabled ? t("common.close") : t("common.enable")}
        </button>
      </strong>
      <span>{t("settings.diagnosticsBundle")}</span>
      <strong className="runtime-diagnostics-action">
        <span>{status === "exported" ? t("settings.diagnosticsExported") : status === "failed" ? t("settings.diagnosticsActionFailed") : t("settings.diagnosticsBundleDescription")}</span>
        <button className="cap-settings-pill" type="button" onClick={exportDiagnostics} title={t("settings.exportDiagnosticsHint")} disabled={busyAction !== null}>
          {busyAction === "export" ? t("settings.exportingDiagnostics") : t("settings.exportDiagnostics")}
        </button>
      </strong>
      <span className="runtime-diagnostics-group runtime-diagnostics-group-separated">llama.cpp</span>
    </>
  );
};
