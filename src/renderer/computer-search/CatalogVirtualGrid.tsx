import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { CatalogGridMode } from "../../shared/catalogPresentationTypes";
import { catalogGridLayout } from "./catalogGridLayout";
import { useCatalogGridSizeAnchor } from "./useCatalogGridSizeAnchor";

export default function CatalogVirtualGrid<T extends { id: string }>({ items, mode, rootRef, renderItem, size = 100 }: {
  items: T[]; mode: CatalogGridMode; rootRef: RefObject<HTMLElement>; size?: number;
  renderItem: (item: T, style: CSSProperties, onRatio: (ratio: number) => void) => ReactNode;
}) {
  const [viewport, setViewport] = useState({ width: 1, height: Infinity, extent: 1, offset: 0, horizontal: false });
  const gridRef = useRef<HTMLDivElement | null>(null);
  const ratios = useRef(new Map<string, number>()), [ratioVersion, setRatioVersion] = useState(0);
  useEffect(() => {
    const root = rootRef.current ?? gridRef.current?.parentElement;
    if (!root) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (!root.clientWidth || !root.clientHeight) return;
      const css = getComputedStyle(root), horizontal = css.overflowY === "hidden";
      const width = root.clientWidth - parseFloat(css.paddingLeft || "0") - parseFloat(css.paddingRight || "0");
      const grid = gridRef.current?.getBoundingClientRect(), bounds = root.getBoundingClientRect();
      const next = { width: Math.max(1, width), height: Math.max(1, root.clientHeight - parseFloat(css.paddingTop || "0") - parseFloat(css.paddingBottom || "0")), horizontal, extent: horizontal ? root.clientWidth : root.clientHeight,
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
    mode === "gallery", index => ratios.current.get(items[index].id) ?? 1, size, viewport.height),
  [items, viewport.width, viewport.height, viewport.horizontal, mode, ratioVersion, size]);
  const onAnchor = useCallback((offset: number) => setViewport(value => value.offset === offset ? value : { ...value, offset }), []);
  useCatalogGridSizeAnchor({ rootRef, gridRef, layout, size, offset: viewport.offset, extent: viewport.extent,
    horizontal: viewport.horizontal, identity: items[0]?.id, onAnchor });
  return <div ref={gridRef} className={`cap-computer-search-grid cap-catalog-file-grid is-${mode} is-virtual`}
    style={{ height: layout.height, width: layout.width, "--cap-grid-icon-scale": viewport.horizontal ? layout.height / 138 : size / 100 } as CSSProperties} data-total-count={items.length}>
    {layout.visible(viewport.offset, viewport.extent).map(position => renderItem(items[position.index], {
      position: "absolute", left: position.left, top: position.top, width: position.width, height: position.height
    }, value => {
      const id = items[position.index].id;
      if (ratios.current.get(id) === value) return;
      ratios.current.set(id, value); setRatioVersion(version => version + 1);
    }))}
  </div>;
}
