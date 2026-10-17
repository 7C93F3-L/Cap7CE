import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useCatalogAutoKeywords } from "./useCatalogAutoKeywords";
import BottomNoticeBar from "../feedback/BottomNoticeBar";
import "./CatalogActivity.css";
import { catalogKeywordJobMessage } from "./catalogKeywordJobMessage";

interface Notice { message: string; id: number; }
const Activity = createContext<(ReturnType<typeof useCatalogAutoKeywords> & { notice: Notice | null; notify: (message: string) => void; clearNotice: () => void; editRequest: { key: string; id: number } | null; requestEdit: (key: string) => void; consumeEditRequest: (id: number) => void }) | null>(null);
export const useCatalogActivity = () => useContext(Activity);
export function CatalogActivityProvider({ children, onShowDetails }: { children: ReactNode; onShowDetails?: () => void }) {
  const automatic = useCatalogAutoKeywords();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editRequest, setEditRequest] = useState<{ key: string; id: number } | null>(null);
  const consumeEditRequest = (id: number) => setEditRequest(value => value?.id === id ? null : value);
  const requestEdit = (key: string) => { onShowDetails?.(); setEditRequest(current => ({ key, id: (current?.id ?? 0) + 1 })); };
  const notify = useCallback((message: string) => setNotice({ message, id: Date.now() }), []);
  const clearNotice = useCallback(() => setNotice(null), []);
  useEffect(() => { if (notice && !automatic.job) { const timer = window.setTimeout(clearNotice, 5000); return () => window.clearTimeout(timer); } }, [notice, automatic.job, clearNotice]);
  useEffect(() => {
    if (!automatic.job?.result) return;
    const timer = window.setTimeout(automatic.dismiss, automatic.job.result.status === "failed" || "failed" in automatic.job.result && automatic.job.result.failed > 0 ? 10000 : 5000);
    return () => window.clearTimeout(timer);
  }, [automatic.job, automatic.dismiss]);
  return <Activity.Provider value={{ ...automatic, notice, notify, clearNotice, editRequest, requestEdit, consumeEditRequest }}>{children}</Activity.Provider>;
}
export function CatalogActivityBar() {
  const activity = useCatalogActivity();
  if (!activity) return null;
  const { job, notice, busy } = activity;
  const message = job ? catalogKeywordJobMessage(job) : notice?.message;
  if (!message) return null;
  return <BottomNoticeBar className="cap-catalog-activity-bar" message={message} progress={busy ? { label: "自动添加关键词" } : undefined}
    actions={busy ? <button type="button" disabled={job?.phase === "saving" && !job.batch || job?.cancelling} onClick={activity.cancel}>取消</button>
      : <button type="button" aria-label="关闭临时提醒" onClick={job ? activity.dismiss : activity.clearNotice}>×</button>} />;
}
