import type { MetadataBuildPhase, MetadataBuildProgress } from "../../shared/metadataBuildTypes";
import "./MetadataBuildPanel.css";

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
}

// Presentation only. Source paths, IPC, consent persistence and task ownership stay outside this view.
export default function MetadataBuildPanel({ progress, scopeSummary, currentDriveLabel, actionBusy = false,
  onStart, onPause, onResume, onChangeScope, onDismiss }: MetadataBuildPanelProps) {
  const initial = progress.phase === "idle";
  const stopped = ["idle", "paused", "completed", "failed"].includes(progress.phase);
  const fraction = progress.progressFraction;
  const count = progress.processed.toLocaleString();
  const total = progress.total?.toLocaleString();
  const eta = progress.remainingSeconds;
  const remaining = eta === null ? "剩余时间估算中" : eta < 60 ? "预计不到 1 分钟" : `预计还需 ${Math.ceil(eta / 60)} 分钟`;
  return <section className="cap-metadata-build" aria-label="文件属性建库">
    <div className="cap-metadata-build-heading">
      <strong role="status" aria-live="polite">{labels[progress.phase]}</strong>
      {onDismiss && stopped && <button type="button" className="cap-metadata-build-close" aria-label="收起建库提示" onClick={onDismiss}>×</button>}
    </div>
    {initial ? <p>文件名和路径搜索已可使用。开始提取后，还能按图像比例、尺寸和视频时长筛选。处理在本机后台进行，你可以继续浏览，也可以随时暂停。</p>
      : <div className="cap-metadata-build-progress">
        {(fraction !== null || !stopped) && <progress max={1} value={fraction ?? undefined} aria-label="本轮属性提取进度" />}
        <div className="cap-metadata-build-count">
          <span>{progress.phase === "discovering" ? `已发现 ${progress.discovered.toLocaleString()} 项`
            : progress.phase === "completed" && progress.total === 0 ? "没有新的提取任务"
            : total === undefined ? `已处理 ${count} 项` : `已处理 ${count} / ${total} 项`}</span>
          {fraction !== null && <span>{Math.round(fraction * 100)}%</span>}
        </div>
        {!stopped && progress.phase !== "pausing" && <span className="cap-metadata-build-detail">{
          progress.phase === "waiting" ? "等待恢复后将继续" : remaining}</span>}
        {progress.failed > 0 && <span className="cap-metadata-build-detail">{progress.failed.toLocaleString()} 项未能提取，不影响其余文件</span>}
        {progress.phase === "failed" && <p>已保存的属性仍可使用，可以稍后重试。</p>}
      </div>}
    <div className="cap-metadata-build-footer">
      <span className="cap-metadata-build-detail">{currentDriveLabel && !initial ? `当前磁盘 ${currentDriveLabel} · ` : ""}{scopeSummary}</span>
      <div className="cap-metadata-build-actions">
        {onChangeScope && stopped && <button type="button" disabled={actionBusy} onClick={onChangeScope}>范围与顺序</button>}
        <button type="button" className="cap-metadata-build-primary" disabled={actionBusy || progress.phase === "pausing"}
          onClick={progress.phase === "paused" ? onResume : stopped ? onStart : onPause}>{
          initial ? "开始提取" : progress.phase === "paused" ? "继续" : progress.phase === "completed" ? "重新检查"
          : progress.phase === "failed" ? "重试" : progress.phase === "pausing" ? "正在暂停…" : "暂停"}</button>
      </div>
    </div>
  </section>;
}
