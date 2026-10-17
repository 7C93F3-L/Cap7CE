import { useCallback, useEffect, useRef, useState } from "react";
import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";
import { getCommonKeywords } from "../dialogs/keywordEditorModel";
import { catalogKeywordKey, catalogKeywordSelectionKey } from "./catalogKeywordIdentity";
import { readBatchKeywords, saveBatchKeywords, type BatchKeywordSnapshot } from "./catalogBatchKeywordOperations";

interface State { key: string; snapshots: BatchKeywordSnapshot[]; keywords: string[]; readState?: "loading" | "unavailable"; editing: boolean; saving: boolean; error: string; }
const empty = (key: string): State => ({ key, snapshots: [], keywords: [], readState: "loading", editing: false, saving: false, error: "" });
export function useCatalogBatchKeywords(items: ComputerSearchItem[], taskId: string, foreground: boolean, notify: (message: string) => void) {
  const key = catalogKeywordSelectionKey(items), latest = useRef({ items, taskId, foreground }); latest.current = { items, taskId, foreground };
  const generation = useRef(0), saving = useRef(false), [reload, setReload] = useState(0), [state, setState] = useState(() => empty(key));
  useEffect(() => {
    const epoch = ++generation.current; saving.current = false;
    if (!foreground) return;
    setState(empty(key));
    const timer = window.setTimeout(() => {
      void readBatchKeywords(latest.current.items.filter(item => !item.isDirectory), latest.current.taskId, () => generation.current === epoch).then(snapshots => {
        if (generation.current === epoch) setState({ ...empty(key), snapshots, keywords: getCommonKeywords(snapshots), readState: undefined });
      }, () => { if (generation.current === epoch) setState({ ...empty(key), readState: "unavailable" }); });
    }, 160);
    return () => { generation.current++; window.clearTimeout(timer); };
  }, [key, foreground, reload]);
  const current = state.key === key ? state : empty(key), retry = useCallback(() => setReload(value => value + 1), []);
  return { ...current, sessionId: key, available: !current.readState, retry,
    edit: () => { if (!current.readState) setState(value => ({ ...value, editing: true, error: "" })); },
    cancel: () => { if (!saving.current) retry(); },
    save: async (target: string[]) => {
      if (saving.current || current.readState || !foreground) return;
      const epoch = generation.current; saving.current = true; setState(value => ({ ...value, saving: true, error: "" }));
      const results = await saveBatchKeywords(current.snapshots, current.keywords, target, identity => {
        if (generation.current !== epoch || !latest.current.foreground) return null;
        const item = latest.current.items.find(value => catalogKeywordKey(value) === identity);
        return item ? { taskId: latest.current.taskId, authorizationId: item.authorizationId } : null;
      });
      const failed = results.filter(value => !value).length;
      notify(`关键词保存：成功 ${results.length - failed}，失败 ${failed}`);
      if (generation.current !== epoch) return;
      saving.current = false;
      if (failed) setState(value => ({ ...value, saving: false, error: `${failed} 个文件未保存，已保留编辑内容，可重试。` }));
      else retry();
    }
  };
}
