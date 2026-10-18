import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../../../electron/localization";
import { useTransientFeedback } from "../controllers/useTransientFeedback";

export const metadataBuildChanged = "cap-metadata-build-changed";
export function useDirectoryMetadataAction() {
  const pending = useRef(false), live = useRef(true), feedback = useTransientFeedback();
  const [busy, setBusy] = useState(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const perform = useCallback(async (path?: string) => {
    if (pending.current) return false;
    pending.current = true; setBusy(true);
    try {
      const api = window.cap7ce?.metadataBuild;
      if (!api?.startDirectory) throw new Error("metadata-bridge-unavailable");
      const status = path === undefined ? await api.startAllVolumes({ allowMetadataExtraction: true })
        : await api.startDirectory({ path, allowMetadataExtraction: true });
      window.dispatchEvent(new CustomEvent(metadataBuildChanged, { detail: status }));
      if (live.current) feedback.show(t("metadataDirectory.queued"));
      return true;
    } catch { if (live.current) feedback.show(t("metadataDirectory.failed")); return false; }
    finally { pending.current = false; if (live.current) setBusy(false); }
  }, [feedback.show]);
  return { start: useCallback((path: string) => perform(path), [perform]), startAll: useCallback(() => perform(), [perform]), busy, message: feedback.message };
}
