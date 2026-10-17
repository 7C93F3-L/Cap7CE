import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useCatalogAutoKeywords } from "./useCatalogAutoKeywords";
import BottomNoticeBar from "../feedback/BottomNoticeBar";
import "./CatalogActivity.css";

interface Notice { message: string; id: number; }
const Activity = createContext<(ReturnType<typeof useCatalogAutoKeywords> & { notice: Notice | null; notify: (message: string) => void; clearNotice: () => void }) | null>(null);
export const useCatalogActivity = () => useContext(Activity);
export function CatalogActivityProvider({ children }: { children: ReactNode }) {
  const automatic = useCatalogAutoKeywords();
  const [notice, setNotice] = useState<Notice | null>(null);
  const notify = useCallback((message: string) => setNotice({ message, id: Date.now() }), []);
  const clearNotice = useCallback(() => setNotice(null), []);
  useEffect(() => { if (notice && !automatic.job) { const timer = window.setTimeout(clearNotice, 5000); return () => window.clearTimeout(timer); } }, [notice, automatic.job, clearNotice]);
  useEffect(() => {
    if (!automatic.job?.result) return;
    const timer = window.setTimeout(automatic.dismiss, automatic.job.result.status === "failed" ? 10000 : 5000);
    return () => window.clearTimeout(timer);
  }, [automatic.job, automatic.dismiss]);
  return <Activity.Provider value={{ ...automatic, notice, notify, clearNotice }}>{children}</Activity.Provider>;
}
const phaseText = { preparing: "正在准备图片", starting: "正在启动模型", generating: "正在生成关键词", saving: "正在保存关键词" };
export function CatalogActivityBar() {
  const activity = useCatalogActivity();
  if (!activity) return null;
  const { job, notice, busy } = activity;
  const message = job ? `${job.name} · ${!job.result ? job.cancelling ? "正在取消" : phaseText[job.phase] : job.result.status === "saved"
    ? job.result.added > 0 ? `已添加 ${job.result.added} 个关键词` : "关键词已是最新，无新增项"
    : job.result.status === "cancelled" ? "已取消自动添加关键词" : job.result.message}` : notice?.message;
  if (!message) return null;
  return <BottomNoticeBar className="cap-catalog-activity-bar" message={message} progress={busy ? { label: "自动添加关键词" } : undefined}
    actions={busy ? <button type="button" disabled={job?.phase === "saving" || job?.cancelling} onClick={activity.cancel}>取消</button>
      : <button type="button" aria-label="关闭临时提醒" onClick={job ? activity.dismiss : activity.clearNotice}>×</button>} />;
}
