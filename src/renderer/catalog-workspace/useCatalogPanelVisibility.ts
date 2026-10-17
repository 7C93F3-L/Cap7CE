import { useCallback, useEffect, useRef, useState } from "react";
import type { useCatalogViewport } from "./useCatalogViewport";

type Panel = "filters" | "details";
export function useCatalogPanelVisibility(viewport: ReturnType<typeof useCatalogViewport>) {
  const [open, setOpen] = useState({ filters: true, details: true }), [forced, setForced] = useState({ filters: false, details: false });
  const [restoring, setRestoring] = useState(false), [restoreError, setRestoreError] = useState(false);
  const pending = useRef<Promise<boolean> | null>(null), mounted = useRef(true), previous = useRef(viewport);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const old = previous.current; previous.current = viewport;
    if (viewport.width < old.width || viewport.height < old.height) setForced(value => ({
      filters: value.filters && viewport.height >= old.height, details: value.details && viewport.width >= old.width && viewport.height >= old.height
    }));
  }, [viewport]);
  const constrained = { filters: viewport.filtersConstrained, details: viewport.detailsConstrained || viewport.filtersConstrained };
  const visible = { filters: open.filters && (!constrained.filters || forced.filters), details: open.details && (!constrained.details || forced.details) };
  const restore = useCallback(() => {
    if (pending.current) return pending.current;
    setRestoring(true); setRestoreError(false);
    const request = Promise.resolve().then(() => window.cap7ce?.window?.setShellState("normal", { forceBounds: true, preservePosition: true }))
      .then(result => result === true).catch(() => false).then(async success => {
        if (success && mounted.current) await new Promise<void>(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
        pending.current = null;
        if (mounted.current) { setRestoring(false); setRestoreError(!success); }
        return success;
      });
    pending.current = request; return request;
  }, []);
  const expand = async (panel: Panel) => {
    if ((constrained.filters || constrained.details) && !await restore()) return;
    if (!mounted.current) return;
    setOpen(value => ({ ...value, [panel]: true }));
    setForced(value => ({ ...value, [panel]: constrained[panel] }));
  };
  const toggle = (panel: Panel) => {
    if (visible[panel]) { setOpen(value => ({ ...value, [panel]: false })); setForced(value => ({ ...value, [panel]: false })); }
    else void expand(panel);
  };
  const showDetails = useCallback(() => setOpen(value => value.details ? value : { ...value, details: true }), []);
  return { filtersVisible: visible.filters, detailsVisible: visible.details, restoring, restoreError,
    dismissRestoreError: () => setRestoreError(false),
    toggleFilters: () => toggle("filters"), toggleDetails: () => toggle("details"),
    showDetails, revealDetails: () => { void expand("details"); } };
}
