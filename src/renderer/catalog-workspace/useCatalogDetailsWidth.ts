import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { defaultDetailsWidth as defaultWidth, minimumDetailsWidth as minWidth, maximumDetailsWidth as maxWidth, readCatalogDetailsWidth, saveCatalogDetailsWidth } from "./catalogDetailsWidthPreference";

export function useCatalogDetailsWidth(sidebarWidth: number, visible: boolean) {
  const [preferred, setPreferred] = useState(readCatalogDetailsWidth), [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const current = useRef(preferred);
  const change = useCallback((value: number) => { current.current = Math.round(value); setPreferred(current.current); }, []);
  const drag = useRef<{ x: number; width: number; pointerId: number } | null>(null);
  const clamp = useCallback((value: number) => Math.max(minWidth, Math.min(maxWidth, value,
    viewportWidth - sidebarWidth - 32 - 300)), [sidebarWidth, viewportWidth]);
  const width = clamp(preferred);
  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      if (drag.current?.pointerId === event.pointerId) change(clamp(drag.current.width + drag.current.x - event.clientX));
    };
    const end = () => { if (drag.current) { drag.current = null; saveCatalogDetailsWidth(current.current); } };
    if (!visible) end();
    const resize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end); window.addEventListener("blur", end); window.addEventListener("resize", resize);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end); window.removeEventListener("blur", end); window.removeEventListener("resize", resize); };
  }, [clamp, visible, change]);
  const startResize = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width, pointerId: event.pointerId };
  };
  return { width, minWidth, maxWidth, startResize,
    resetWidth: () => { drag.current = null; change(defaultWidth); saveCatalogDetailsWidth(defaultWidth); },
    resizeKey: (key: string) => { if (key === "ArrowLeft" || key === "ArrowRight") { const next = clamp(clamp(current.current) + (key === "ArrowLeft" ? 16 : -16)); change(next); saveCatalogDetailsWidth(next); } } };
}
