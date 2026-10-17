import { useEffect, useRef } from "react";

// Bind to the actual scroll element: portal menus retain their own wheel behavior.
export function useHorizontalFilterScroll() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.defaultPrevented) return;
      const maximum = element.scrollWidth - element.clientWidth;
      if (maximum <= 0) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!Number.isFinite(delta) || delta === 0) return;
      const unit = event.deltaMode === 1 ? parseFloat(getComputedStyle(element).lineHeight) || 16
        : event.deltaMode === 2 ? element.clientWidth : 1;
      const next = Math.max(0, Math.min(maximum, element.scrollLeft + delta * unit));
      if (next === element.scrollLeft) return;
      event.preventDefault();
      element.scrollLeft = next;
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  return ref;
}
