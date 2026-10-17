import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { defaultSidebarWidth, minimumSidebarWidth as minimum, maximumSidebarWidth as maximum, readCatalogSidebarWidth, saveCatalogSidebarWidth } from "./catalogSidebarWidthPreference";

export function useCatalogSidebarWidth(viewportWidth: number) {
  const [preferred, setPreferred] = useState(readCatalogSidebarWidth), current = useRef(preferred);
  const drag = useRef<{ x: number; width: number; pointerId: number } | null>(null);
  const width = Math.min(preferred, Math.max(minimum, viewportWidth - 260));
  const change = useCallback((value: number, save = false) => {
    current.current = Math.max(minimum, Math.min(maximum, Math.round(value))); setPreferred(current.current);
    if (save) saveCatalogSidebarWidth(current.current);
  }, []);
  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      if (drag.current?.pointerId === event.pointerId) change(Math.min(drag.current.width + event.clientX - drag.current.x, Math.max(minimum, window.innerWidth - 260)));
    };
    const end = () => { if (drag.current) { drag.current = null; saveCatalogSidebarWidth(current.current); } };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end); window.addEventListener("blur", end);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end); window.removeEventListener("blur", end); };
  }, [change]);
  const startResize = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width, pointerId: event.pointerId };
  };
  return { width, minWidth: minimum, maxWidth: maximum, collapsed: width < 90, startResize,
    resetWidth: () => { drag.current = null; change(defaultSidebarWidth, true); },
    resizeKey: (key: string) => { if (key === "ArrowLeft" || key === "ArrowRight") change(Math.min(width + (key === "ArrowLeft" ? -16 : 16), Math.max(minimum, viewportWidth - 260)), true); } };
}
