import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

const defaultWidth = 280, minWidth = 220, maxWidth = 420;
export function useCatalogDetailsWidth(sidebarWidth: number, visible: boolean) {
  const [width, setWidth] = useState(defaultWidth);
  const drag = useRef<{ x: number; width: number; pointerId: number } | null>(null);
  const clamp = useCallback((value: number) => Math.max(minWidth, Math.min(maxWidth, value,
    window.innerWidth - sidebarWidth - 32 - (window.innerWidth > 1000 ? 300 : 0))), [sidebarWidth]);
  useEffect(() => {
    if (!visible) drag.current = null;
    const move = (event: globalThis.PointerEvent) => {
      if (drag.current?.pointerId === event.pointerId) setWidth(clamp(drag.current.width + drag.current.x - event.clientX));
    };
    const end = () => { drag.current = null; };
    const resize = () => setWidth(value => clamp(value));
    resize();
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end); window.addEventListener("blur", end); window.addEventListener("resize", resize);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end); window.removeEventListener("blur", end); window.removeEventListener("resize", resize); };
  }, [clamp, visible]);
  const startResize = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width, pointerId: event.pointerId };
  };
  return { width, minWidth, maxWidth, startResize,
    resetWidth: () => { drag.current = null; setWidth(clamp(defaultWidth)); },
    resizeKey: (key: string) => { if (key === "ArrowLeft" || key === "ArrowRight") setWidth(value => clamp(value + (key === "ArrowLeft" ? 16 : -16))); } };
}
