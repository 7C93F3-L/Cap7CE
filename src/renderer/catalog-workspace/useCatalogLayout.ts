import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

const defaultSidebarWidth = 156;

export function useCatalogLayout() {
  const [width, setWidth] = useState(defaultSidebarWidth);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [detailsVisible, setDetailsVisible] = useState(true);
  const showDetails = useCallback(() => setDetailsVisible(true), []);
  const [metadataOpen, setMetadataOpen] = useState(false);
  useEffect(() => window.cap7ce?.settingsWindow?.onMetadataBuildRequested?.(() => setMetadataOpen(true)), []);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const clamp = (value: number) => Math.max(52, Math.min(320, Math.max(52, window.innerWidth - 300), value));
  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      if (drag.current) setWidth(clamp(drag.current.width + event.clientX - drag.current.x));
    };
    const end = () => { drag.current = null; };
    const resize = () => setWidth(value => clamp(value));
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end); window.addEventListener("resize", resize);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end); window.removeEventListener("resize", resize); };
  }, []);
  const startResize = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width };
  };
  return { width, collapsed: width < 90, filtersVisible, detailsVisible, metadataOpen,
    toggleFilters: () => setFiltersVisible(value => !value), toggleDetails: () => setDetailsVisible(value => !value),
    showDetails, toggleMetadata: () => setMetadataOpen(value => !value), startResize,
    resetWidth: () => { drag.current = null; setWidth(clamp(defaultSidebarWidth)); },
    resizeKey: (key: string) => { if (key === "ArrowLeft" || key === "ArrowRight") setWidth(value => clamp(value + (key === "ArrowLeft" ? -16 : 16))); },
    toggleWidth: () => setWidth(value => value < 90 ? defaultSidebarWidth : 52) };
}
