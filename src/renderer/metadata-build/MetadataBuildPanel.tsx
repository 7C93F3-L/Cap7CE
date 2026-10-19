import type { MetadataBuildPhase, MetadataBuildProgress } from "../../shared/metadataBuildTypes";
import "./MetadataBuildPanel.css";
import { metadataBuildStorageMessage } from "./metadataBuildStorageMessage";
import GradientProgress from "../feedback/GradientProgress";

const labels: Record<MetadataBuildPhase, string> = {
  idle: "让全盘搜索支持更多条件", preparing: "正在准备", discovering: "正在查找需要提取的文件",
  extracting: "正在提取文件属性", waiting: "正在等待磁盘或任务恢复", pausing: "正在暂停",
  paused: "已暂停", completed: "本轮属性提取已完成", failed: "属性提取暂时中断"
};

export interface MetadataBuildPanelProps {
  progress: MetadataBuildProgress;
  scopeSummary: string;
  currentDriveLabel?: string;
  actionBusy?: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onChangeScope?: () => void;
  onDismiss?: () => void;
  onCancel?: () => void;
}

// Presentation only. Source paths, IPC, consent persistence and task ownership stay outside this view.
export default function MetadataBuildPanel({ progress, scopeSummary, currentDriveLabel, actionBusy = false,
  onStart, onPause, onResume, onChangeScope, onDismiss, onCancel }: MetadataBuildPanelProps) {
  const initial = progress.phase === "idle";
  const stopped = ["idle", "paused", "completed", "failed"].includes(progress.phase);
  const fraction = progress.progressFraction;
  const count = progress.processed.toLocaleString();
  const total = progress.total?.toLocaleString();
  const eta = progress.remainingSeconds;
  const remaining = eta === null ? "剩余时间估算中" : eta < 60 ? "预计不到 1 分钟" : `预计还需 ${Math.ceil(eta / 60)} 分钟`;
  const partial = progress.phase === "completed" && progress.failed > 0;
  return <section className="cap-metadata-build" aria-label="文件属性建库">
    <div className="cap-metadata-build-heading">
      <strong role="status" aria-live="polite">{partial ? `本轮提取完成，${progress.failed.toLocaleString()} 项未能提取` : labels[progress.phase]}</strong>
      {!initial && <span className="cap-metadata-build-detail cap-metadata-build-count">{
        progress.phase === "discovering" ? `已发现 ${progress.discovered.toLocaleString()} 项`
        : progress.phase === "completed" && progress.total === 0 ? "没有新的提取任务"
        : progress.phase === "failed" && progress.processed === 0 ? "本轮尚未处理文件"
        : total === undefined ? `已处理 ${count} 项` : `已处理 ${count} / ${total} 项`}{fraction !== null && !stopped ? ` · ${Math.round(fraction * 100)}%` : ""}</span>}
      {onDismiss && stopped && <button type="button" className="cap-metadata-build-close" aria-label="收起建库提示" onClick={onDismiss}>×</button>}
    </div>
    {initial ? <p>提取后可按尺寸、比例、时长等属性筛选。处理在本机进行，可随时暂停。</p>
      : <div className="cap-metadata-build-progress">
        {!stopped && <GradientProgress value={fraction} label="本轮属性提取进度" />}
        {!stopped && progress.phase !== "pausing" && <span className="cap-metadata-build-detail">{
          progress.phase === "waiting" ? "等待恢复后将继续" : remaining}</span>}
        {progress.failed > 0 && !partial && <span className="cap-metadata-build-detail">{progress.failed.toLocaleString()} 项未能提取，不影响其余文件</span>}
        {progress.unsupported > 0 && <span className="cap-metadata-build-detail">{progress.unsupported.toLocaleString()} 项暂不支持提取</span>}
        {progress.phase === "failed" && <p>{progress.errorCode === "metadata-directory-changed" ? "目录身份已变化，请取消此任务后重新选择目录。"
          : progress.errorCode === "metadata-directory-unavailable" ? "目录暂不可访问，请检查磁盘连接及基础目录状态后重试。"
          : progress.errorCode === "metadata-directory-state-unavailable" ? metadataBuildStorageMessage(progress.storageError)
          : "已保存的属性仍可使用，可以稍后重试。"}</p>}
      </div>}
    <div className="cap-metadata-build-footer">
      <span className="cap-metadata-build-detail cap-metadata-build-scope" title={`${currentDriveLabel && !initial ? `当前磁盘 ${currentDriveLabel} · ` : ""}${scopeSummary}`}>{currentDriveLabel && !initial ? `当前磁盘 ${currentDriveLabel} · ` : ""}{scopeSummary}</span>
      <div className="cap-metadata-build-actions">
        {onCancel && <button type="button" disabled={actionBusy} onClick={onCancel}>取消目录任务</button>}
        {onChangeScope && stopped && <button type="button" disabled={actionBusy} onClick={onChangeScope}>范围与顺序</button>}
        <button type="button" className="cap-metadata-build-primary" disabled={actionBusy || progress.phase === "pausing"}
          onClick={progress.phase === "paused" ? onResume : stopped ? onStart : onPause}>{
          initial ? "开始提取" : progress.phase === "paused" ? "继续" : progress.phase === "completed" ? "重新检查"
          : progress.phase === "failed" ? "重试" : progress.phase === "pausing" ? "正在暂停…" : "暂停"}</button>
      </div>
    </div>
  </section>;
}
