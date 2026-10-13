import { useEffect, useState } from "react";

export function useCatalogDriveLabels(refreshVersion: number) {
  const [labels, setLabels] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    const api = window.cap7ce?.skim;
    if (!api?.read) return;
    const taskId = `catalog_drive_labels_${crypto.randomUUID()}`;
    let live = true, pending = true;
    void api.read({ taskId, path: null, options: { query: "", fileFormat: "", sortField: "name", sortDirection: "asc" } })
      .then(result => {
        if (!live || result.cancelled) return;
        setLabels(new Map(result.entries.filter(entry => entry.kind === "drive" && /^[A-Za-z]:\\$/.test(entry.path) && entry.label?.trim())
          .map(entry => [entry.path.slice(0, 2).toUpperCase(), entry.label!.trim()])));
      }).catch(() => { /* Keep the existing labels and drive-letter fallback available. */ })
      .finally(() => { pending = false; });
    return () => { live = false; if (pending) void api.cancel(taskId).catch(() => undefined); };
  }, [refreshVersion]);
  return labels;
}
