import { useCallback, useEffect, useRef, useState } from "react";
import type { MetadataBuildProgress } from "../../shared/metadataBuildTypes";
import { MetadataResultRefreshGate } from "./computerSearchResultRefresh";

export function useComputerSearchMetadataRefresh(enabled: boolean, foreground: boolean, blocked: boolean,
  refresh: () => Promise<"applied" | "failed" | "deferred">, metadataEnabled = true) {
  const gate = useRef(new MetadataResultRefreshGate());
  const [revision, setRevision] = useState(0);
  const running = useRef(false);
  const live = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => window.cap7ce?.computerSearch.onCatalogChanged?.(revision => {
    gate.current.observeCatalog(revision); setRevision(value => value + 1);
  }), []);
  const observe = useCallback((progress: MetadataBuildProgress) => {
    if (!metadataEnabled) return;
    gate.current.observe(progress);
    setRevision((value) => value + 1);
  }, [metadataEnabled]);
  useEffect(() => {
    if (!enabled || !foreground || blocked || running.current) return;
    const next = gate.current.next(Date.now());
    if (!next) return;
    const timer = setTimeout(async () => {
      running.current = true;
      const outcome = await refresh();
      gate.current.finish(next.stamp, Date.now(), outcome);
      running.current = false;
      // New observations during this request must still get a scheduling pass.
      if (live.current && outcome !== "deferred") setRevision((value) => value + 1);
    }, next.delay);
    return () => clearTimeout(timer);
  }, [enabled, foreground, blocked, refresh, revision]);
  return observe;
}
