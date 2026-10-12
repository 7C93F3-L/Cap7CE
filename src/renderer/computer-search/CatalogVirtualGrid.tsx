import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { CatalogGridMode } from "../../shared/catalogPresentationTypes";
import { catalogGridLayout } from "./catalogGridLayout";

export default function CatalogVirtualGrid<T extends { id: string }>({ items, mode, rootRef, renderItem }: {
  items: T[]; mode: CatalogGridMode; rootRef: RefObject<HTMLElement>;
  renderItem: (item: T, style: CSSProperties, onRatio: (ratio: number) => void) => ReactNode;
}) {
  const [viewport, setViewport] = useState({ width: 1, extent: 1, offset: 0, horizontal: false });
  const gridRef = useRef<HTMLDivElement | null>(null);
  const ratios = useRef(new Map<string, number>()), [ratioVersion, setRatioVersion] = useState(0);
  useEffect(() => {
    const root = rootRef.current ?? gridRef.current?.parentElement;
    if (!root) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const css = getComputedStyle(root), horizontal = css.overflowY === "hidden";
      const width = root.clientWidth - parseFloat(css.paddingLeft || "0") - parseFloat(css.paddingRight || "0");
      const grid = gridRef.current?.getBoundingClientRect(), bounds = root.getBoundingClientRect();
      const next = { width: Math.max(1, width), horizontal, extent: horizontal ? root.clientWidth : root.clientHeight,
        offset: grid ? (horizontal ? bounds.left + root.clientLeft - grid.left : bounds.top + root.clientTop - grid.top) : 0 };
      setViewport(previous => Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule); observer.observe(root);
    if (gridRef.current) observer.observe(gridRef.current);
    if (gridRef.current?.parentElement?.parentElement) observer.observe(gridRef.current.parentElement.parentElement);
    root.addEventListener("scroll", schedule, { passive: true }); measure();
    return () => { observer.disconnect(); root.removeEventListener("scroll", schedule); cancelAnimationFrame(frame); };
  }, [rootRef]);
  useLayoutEffect(() => {
    if (ratios.current.size) { ratios.current.clear(); setRatioVersion(version => version + 1); }
  }, [items[0]?.id]);
  const layout = useMemo(() => catalogGridLayout(items.length, viewport.width, viewport.horizontal,
    mode === "gallery", index => ratios.current.get(items[index].id) ?? 1),
  [items, viewport.width, viewport.horizontal, mode, ratioVersion]);
  return <div ref={gridRef} className={`cap-computer-search-grid cap-catalog-file-grid is-${mode} is-virtual`}
    style={{ height: layout.height, width: layout.width }} data-total-count={items.length}>
    {layout.visible(viewport.offset, viewport.extent).map(position => renderItem(items[position.index], {
      position: "absolute", left: position.left, top: position.top, width: position.width, height: position.height
    }, value => {
      const id = items[position.index].id;
      if (ratios.current.get(id) === value) return;
      ratios.current.set(id, value); setRatioVersion(version => version + 1);
    }))}
  </div>;
}
