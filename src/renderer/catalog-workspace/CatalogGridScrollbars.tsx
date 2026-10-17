import { useEffect, type RefObject } from "react";
import CustomScrollbar from "../CustomScrollbar";
import "../CustomScrollbar.css";
import "./CatalogGridScrollbars.css";

export default function CatalogGridScrollbars({ scrollContainerRef }: { scrollContainerRef: RefObject<HTMLElement | null> }) {
  useEffect(() => {
    const element = scrollContainerRef.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.defaultPrevented || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const css = getComputedStyle(element);
      if (css.overflowY !== "hidden") return;
      const maximum = element.scrollWidth - element.clientWidth;
      if (maximum <= 0 || !Number.isFinite(event.deltaY)) return;
      const unit = event.deltaMode === 1 ? parseFloat(css.lineHeight) || 16
        : event.deltaMode === 2 ? element.clientWidth : 1;
      const next = Math.max(0, Math.min(maximum, element.scrollLeft + event.deltaY * unit));
      if (next === element.scrollLeft) return;
      element.scrollLeft = next;
      event.preventDefault();
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [scrollContainerRef]);
  return <div className="cap-catalog-grid-scrollbars" data-selection-preserve="true">
    <CustomScrollbar scrollContainerRef={scrollContainerRef} orientation="vertical" />
    <CustomScrollbar scrollContainerRef={scrollContainerRef} orientation="horizontal" />
  </div>;
}
