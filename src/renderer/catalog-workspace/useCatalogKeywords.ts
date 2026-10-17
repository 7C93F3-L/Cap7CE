import { useEffect, useRef, useState } from "react";
import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";
import type { CatalogKeywordSnapshot } from "../../shared/catalogKeywordTypes";
import { t } from "../../../electron/localization";

interface State extends CatalogKeywordSnapshot { key: string; readState?: "loading" | "unavailable"; editing: boolean; saving: boolean; error: string; }
const empty = (key: string): State => ({ key, keywords: [], revision: null, readState: "loading", editing: false, saving: false, error: "" });
export function useCatalogKeywords(item: ComputerSearchItem, taskId: string, foreground: boolean) {
  const key = `${item.volumeId ?? ""}:${item.fileReference ?? item.path}:${item.createdFileTimeMilliseconds ?? item.createdUtcTicks ?? ""}`;
  const latest = useRef({ key, taskId, authorizationId: item.authorizationId, foreground });
  latest.current = { key, taskId, authorizationId: item.authorizationId, foreground };
  const generation = useRef(0), pendingSave = useRef(false);
  const [state, setState] = useState<State>(() => empty(key)), [reload, setReload] = useState(0);
  useEffect(() => {
    const epoch = ++generation.current;
    pendingSave.current = false;
    if (!foreground) return;
    setState(empty(key));
    const timer = window.setTimeout(() => {
      const authorization = latest.current;
      const read = window.cap7ce?.computerSearch.readKeywords;
      const request = read ? read(authorization) : Promise.reject(Error("catalog-keywords-unavailable"));
      void request.then(value => {
        if (generation.current === epoch && latest.current.key === key) setState({ ...empty(key), ...value, readState: undefined });
      }, () => {
        if (generation.current === epoch && latest.current.key === key) setState({ ...empty(key), readState: "unavailable" });
      });
    }, 160);
    return () => { generation.current++; window.clearTimeout(timer); };
  }, [key, foreground, reload]);
  const current = state.key === key ? state : empty(key);
  const retry = () => setReload(value => value + 1);
  return { sessionId: key, keywords: current.keywords, available: !current.readState, readState: current.readState,
    editing: current.editing, saving: current.saving, error: current.error, retry,
    edit: () => { if (!current.readState) setState(value => ({ ...value, editing: true, error: "" })); },
    cancel: () => { if (!pendingSave.current) retry(); },
    save: async (words: string[]) => {
      if (pendingSave.current || current.readState || !latest.current.foreground) return;
      const epoch = generation.current, authorization = latest.current;
      pendingSave.current = true; setState(value => ({ ...value, saving: true, error: "" }));
      try {
        const save = window.cap7ce?.computerSearch.saveKeywords;
        if (!save) throw Error("catalog-keywords-unavailable");
        const result = await save({ taskId: authorization.taskId, authorizationId: authorization.authorizationId,
          keywords: words, expectedRevision: current.revision });
        if (generation.current !== epoch || latest.current.key !== key) return;
        if (!result.saved) setState(value => ({ ...value, saving: false, error: t("preview.sidebar.keywordConflict") }));
        else setState({ ...empty(key), ...result.current, readState: undefined });
      } catch {
        if (generation.current === epoch && latest.current.key === key) setState(value => ({ ...value, saving: false, error: t("error.metadataSaveFailed") }));
      } finally { if (generation.current === epoch) pendingSave.current = false; }
    }
  };
}
