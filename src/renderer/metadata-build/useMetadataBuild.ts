import { useCallback, useEffect, useRef, useState } from "react";
import type { MetadataBuildStatus } from "../../shared/metadataBuildTypes";
import { metadataBuildChanged } from "./useDirectoryMetadataAction";

// Visibility gates display refresh, not the main-process build lifetime.
export function useMetadataBuild(enabled: boolean, foreground: boolean) {
  const [status, setStatus] = useState<MetadataBuildStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const live = useRef(false);
  const locked = useRef(false);
  const owner = useRef(0);
  const observation = useRef(0);
  const refresh = useCallback(async () => {
    const api = window.cap7ce?.metadataBuild;
    if (!api || !live.current || locked.current) return;
    const epoch = owner.current, sequence = ++observation.current;
    try {
      const next = await api.status();
      if (live.current && owner.current === epoch && observation.current === sequence) { setStatus(next); setError(false); }
    }
    catch { if (live.current && owner.current === epoch) setError(true); }
  }, []);
  useEffect(() => {
    owner.current++;
    live.current = enabled;
    if (enabled) setBusy(locked.current);
    return () => { live.current = false; owner.current++; observation.current++; };
  }, [enabled]);
  useEffect(() => {
    if (enabled && foreground) void refresh();
    const changed = () => { if (enabled && foreground) void refresh(); };
    window.addEventListener(metadataBuildChanged, changed);
    const unsubscribe = window.cap7ce?.metadataBuild?.onChanged?.(changed);
    return () => { observation.current++; unsubscribe?.(); window.removeEventListener(metadataBuildChanged, changed); };
  }, [enabled, foreground, refresh]);
  useEffect(() => {
    if (!enabled || !foreground || !status || ["idle", "paused", "completed", "failed"].includes(status.progress.phase)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { await refresh(); if (!cancelled) timer = setTimeout(poll, 1000); };
    timer = setTimeout(poll, 1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled, foreground, status?.progress.phase, refresh]);
  const action = useCallback(async (kind: "start" | "pause" | "resume" | "cancelDirectories" | "savePolicy", nextPolicy = status?.policy) => {
    const api = window.cap7ce?.metadataBuild;
    if (!api || !status || !live.current || locked.current) return null;
    const epoch = owner.current;
    observation.current++;
    locked.current = true; setBusy(true); setError(false);
    try {
      const policy = nextPolicy ?? { volumeOrder: status.volumes.map((volume) => volume.volumeId),
        includes: status.volumes.map((volume) => ({ volumeId: volume.volumeId, rootFileReference: null })), excludes: [] };
      const next = kind === "start" ? await api.start({ allowMetadataExtraction: true, policy }) : kind === "savePolicy" ? await api.savePolicy(policy) : await api[kind]();
      if (live.current && owner.current === epoch) setStatus(next);
      return next;
    } catch {
      if (live.current && owner.current === epoch) {
        setError(true);
        try { const next = await api.status(); if (live.current && owner.current === epoch) setStatus(next); } catch { /* Keep the last task visible. */ }
      }
      return null;
    }
    finally { locked.current = false; if (live.current) setBusy(false); }
  }, [status]);
  return { status, busy, error, action, refresh, clearError: () => setError(false) };
}
