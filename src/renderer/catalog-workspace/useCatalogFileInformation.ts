import { useEffect, useState } from "react";
import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";
import type { CatalogFileDetails, FileInformationData } from "../../shared/fileInformationTypes";

export function useCatalogFileInformation(item: ComputerSearchItem, taskId: string, foreground: boolean) {
  const key = `${taskId}:${item.authorizationId}:${item.path}:${item.sizeBytes}:${item.modifiedUtcTicks}`;
  const [result, setResult] = useState<{ key: string; value: CatalogFileDetails | null; loading: boolean }>({ key: "", value: null, loading: false });
  useEffect(() => {
    if (!foreground) return;
    let current = true;
    const requestId = crypto.randomUUID();
    setResult({ key, value: null, loading: true });
    const timer = window.setTimeout(() => {
      if (!window.cap7ce?.computerSearch.readFileDetails) { setResult({ key, value: null, loading: false }); return; }
      void window.cap7ce?.computerSearch.readFileDetails({ taskId, authorizationId: item.authorizationId, requestId })
        .then(value => { if (current) setResult({ key, value: value ?? null, loading: false }); },
          () => { if (current) setResult({ key, value: null, loading: false }); });
    }, 160);
    return () => { current = false; window.clearTimeout(timer); void window.cap7ce?.computerSearch.cancelFileDetails?.({ requestId }).catch(() => undefined); };
  }, [key, taskId, item.authorizationId, foreground]);
  const details = result.key === key ? result.value : null;
  const info = details?.info;
  const data: FileInformationData = {
    sessionId: key, fileName: item.name, filePath: item.path, fileSize: info?.size ?? item.sizeBytes,
    modifiedAt: info?.modifiedAt ?? (item.modifiedUtcTicks ? new Date(item.modifiedUtcTicks / 10000 - 11644473600000).toISOString() : ""),
    info, imageWidth: details?.imageWidth, imageHeight: details?.imageHeight, embeddedMetadata: details?.embeddedMetadata,
    skimActive: true, manualKeywords: [], searchEvidence: null
  };
  return { data, metadataStatus: foreground && (result.key !== key || result.loading) ? "loading" as const : !details ? "unavailable" as const : undefined };
}
