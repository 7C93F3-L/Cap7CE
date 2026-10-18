import { useEffect, useRef, useState } from "react";
import { t, type TranslationKey } from "../../../electron/localization";
import type { MetadataBuildProgress } from "../../shared/metadataBuildTypes";
import { useDirectoryMetadataAction } from "../metadata-build/useDirectoryMetadataAction";

export function useCatalogAttributeHelp(key: string, path: string | null, state: string | undefined, unavailable: boolean,
  progress: MetadataBuildProgress | null | undefined, onCustom?: () => void) {
  const action = useDirectoryMetadataAction(), serial = useRef(0);
  const [request, setRequest] = useState<{ key: string; id: number; failed?: boolean } | null>(null), [held, hold] = useState(false);
  const checking = state === "checking", shown = request?.key === key && (checking || unavailable), phase = progress?.phase;
  const task = Boolean(phase && !["idle", "completed"].includes(phase));
  useEffect(() => { setRequest(null); hold(false); }, [key]);
  useEffect(() => { if (!checking && !unavailable) setRequest(null); }, [checking, unavailable]);
  useEffect(() => {
    if (!shown || held || action.busy) return;
    const timer = window.setTimeout(() => setRequest(null), 10000);
    return () => window.clearTimeout(timer);
  }, [shown, request?.id, held, action.busy]);
  const start = async (all: boolean) => {
    const own = request;
    const started = await (all ? action.startAll() : path ? action.start(path) : Promise.resolve(false));
    setRequest(current => current && current === own ? started ? null : { ...current, failed: true } : current);
  };
  const message: TranslationKey = request?.failed ? "metadataQuick.failed" : task ? phase === "paused" ? "metadataQuick.paused"
    : phase === "failed" ? "metadataQuick.interrupted" : "metadataQuick.running" : checking ? "metadataQuick.checking"
    : state === "unknown" ? "metadataQuick.unavailable" : "metadataQuick.required";
  return { shown: Boolean(shown), request: () => { hold(false); setRequest({ key, id: ++serial.current }); },
    notice: { message: t(message), path, busy: action.busy, task, checking,
      onCurrent: () => void start(false), onAll: () => void start(true), onCustom: () => { setRequest(null); onCustom?.(); },
      onDismiss: () => setRequest(null), onHold: hold } };
}
