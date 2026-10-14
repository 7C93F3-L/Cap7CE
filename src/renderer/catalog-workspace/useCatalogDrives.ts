import { useEffect, useState } from "react";
import type { SkimBrowseEntry } from "../../shared/types";

export function useCatalogDrives(refreshVersion: number, retry: number) {
  const [entries, setEntries] = useState<SkimBrowseEntry[]>([]), [failed, setFailed] = useState(false);
  useEffect(() => {
    const api = window.cap7ce?.skim;
    if (!api?.read) { setFailed(true); return; }
    setFailed(false);
    const taskId = `catalog_drives_${crypto.randomUUID()}`;
    let live = true, pending = true;
    void api.read({ taskId, path: null, options: { query: "", fileFormat: "", sortField: "name", sortDirection: "asc" } })
      .then(result => {
        if (!live || result.cancelled) return;
        setEntries(result.entries.filter(entry => entry.kind === "drive" && /^[A-Za-z]:\\$/.test(entry.path)));
      }).catch(() => { if (live) setFailed(true); })
      .finally(() => { pending = false; });
    return () => { live = false; if (pending) void api.cancel(taskId).catch(() => undefined); };
  }, [refreshVersion, retry]);
  return { entries, failed };
}
