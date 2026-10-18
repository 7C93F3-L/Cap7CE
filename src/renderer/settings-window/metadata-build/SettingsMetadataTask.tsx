import { t, type TranslationKey } from "../../../../electron/localization";
import type { MetadataBuildStatus } from "../../../shared/metadataBuildTypes";

const phases: Record<MetadataBuildStatus["progress"]["phase"], TranslationKey> = {
  idle: "metadataBuild.idle", preparing: "metadataBuild.preparing", discovering: "metadataBuild.discovering", extracting: "metadataBuild.extracting",
  waiting: "metadataBuild.waiting", pausing: "metadataBuild.pausing", paused: "metadataBuild.paused", completed: "metadataBuild.completed", failed: "metadataBuild.failed"
};
export default function SettingsMetadataTask({ status, busy, dirty, canStart, onAction }: {
  status: MetadataBuildStatus; busy: boolean; dirty: boolean; canStart: boolean;
  onAction: (kind: "start" | "pause" | "resume" | "cancelDirectories") => void;
}) {
  const p = status.progress, idle = p.phase === "idle", running = !["idle", "paused", "completed", "failed"].includes(p.phase);
  const directory = Boolean(status.directoryTask?.pending);
  const label = status.volumes.find(v => v.volumeId === p.volumeId)?.label;
  const taskLabel = running ? p.phase === "pausing" ? t("metadataBuild.pausing") : t("metadataBuild.pause")
    : p.phase === "paused" ? t(dirty && !directory ? "metadataBuild.saveResume" : "metadataBuild.resume")
    : p.phase === "completed" ? t(dirty ? "metadataBuild.saveCheck" : "metadataBuild.check")
    : p.phase === "failed" ? t(dirty && !directory ? "metadataBuild.saveRetry" : "common.retry") : t(dirty ? "metadataBuild.saveStart" : "metadataBuild.start");
  return <section className="build-card status-card" aria-label={t("metadataBuild.task")}>
    <div className="card-heading"><h2>{t("metadataBuild.task")}</h2><span className={`status-pill${running ? " is-running" : ""}`} role="status">{running && <i />}{t(phases[p.phase])}</span></div>
    {idle ? <p className="intro">{t("metadataBuild.intro")}</p> : <>
      <div className="task-count"><strong>{(p.phase === "discovering" ? p.discovered : p.processed).toLocaleString()}</strong>
        <span>{p.total === null ? t("metadataBuild.items") : t("metadataBuild.total", { count: p.total.toLocaleString() })}</span>
        {running && <span className="task-estimate">{p.remainingSeconds === null ? t("metadataBuild.estimating") : t("metadataBuild.eta", { minutes: Math.max(1, Math.ceil(p.remainingSeconds / 60)) })}</span>}</div>
      {running && <progress value={p.progressFraction ?? undefined} max={1} aria-label={t("metadataBuild.progress")} />}
      <div className="task-meta"><span>{directory ? t("metadataBuild.directoryCount", { count: status.directoryTask!.pending }) : label ? t("metadataBuild.currentDrive", { label }) : ""}</span>
        <span>{t("metadataBuild.exceptions", { skipped: p.unsupported.toLocaleString(), failed: p.failed.toLocaleString() })}</span></div>
      {p.phase === "failed" && <p className="task-error" role="alert">{t(p.errorCode === "metadata-directory-changed" ? "metadataBuild.directoryChanged"
        : p.errorCode === "metadata-directory-unavailable" ? "metadataBuild.directoryUnavailable" : "metadataBuild.failedHint")}</p>}
    </>}
    {directory && <p className="directory-task-path" title={status.directoryTask!.path}>{status.directoryTask!.path}</p>}
    <div className="task-bottom"><span className="muted">{t(running ? "metadataBuild.background" : directory ? "metadataBuild.directoryHint" : p.phase === "paused" ? "metadataBuild.pauseHint" : "metadataBuild.localHint")}</span>
      <div className="task-actions">{directory && <button type="button" className="cap-stable-settings-button" disabled={busy} onClick={() => onAction("cancelDirectories")}>{t("metadataBuild.cancelDirectories")}</button>}
        <button type="button" data-action="task" className="cap-stable-settings-button primary" disabled={busy || p.phase === "pausing" || (!running && !canStart && !directory)}
          onClick={() => onAction(running ? "pause" : directory || p.phase === "paused" && !dirty ? "resume" : "start")}>{taskLabel}</button></div></div>
  </section>;
}
