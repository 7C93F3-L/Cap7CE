import { useLayoutEffect, useRef, type RefObject } from "react";
import type { catalogGridLayout } from "./catalogGridLayout";

type Snapshot = { size: number; layout: ReturnType<typeof catalogGridLayout>; offset: number; extent: number; horizontal: boolean; identity: string | undefined; scroll: number };
export function useCatalogGridSizeAnchor({ rootRef, gridRef, onAnchor, ...current }: Omit<Snapshot, "scroll"> & {
  rootRef: RefObject<HTMLElement>; gridRef: RefObject<HTMLElement>; onAnchor: (offset: number) => void;
}) {
  const snapshot = useRef<Snapshot | null>(null);
  useLayoutEffect(() => {
    const grid = gridRef.current, root = rootRef.current ?? grid?.parentElement;
    if (!root || !grid) return;
    const previous = snapshot.current;
    if (previous && previous.size !== current.size && previous.identity === current.identity && previous.horizontal === current.horizontal
      && root.querySelectorAll(".cap-catalog-file-grid").length === 1) {
      const first = previous.layout.visible(previous.offset, previous.extent).find(tile => {
        const start = previous.horizontal ? tile.left : tile.top;
        return start + (previous.horizontal ? tile.width : tile.height) > previous.offset && start <= previous.offset + previous.extent;
      });
      const next = first && current.layout.position(first.index);
      if (first && next) {
        const before = current.horizontal ? first.left : first.top, after = current.horizontal ? next.left : next.top;
        const oldExtent = current.horizontal ? first.width : first.height, newExtent = current.horizontal ? next.width : next.height;
        const fraction = Math.max(0, Math.min(1, (previous.offset - before) / oldExtent));
        const delta = after + fraction * newExtent - previous.offset;
        if (current.horizontal) root.scrollLeft = previous.scroll + delta; else root.scrollTop = previous.scroll + delta;
        const scroll = current.horizontal ? root.scrollLeft : root.scrollTop;
        onAnchor(previous.offset + scroll - previous.scroll);
      }
    }
    snapshot.current = { ...current, scroll: current.horizontal ? root.scrollLeft : root.scrollTop };
  }, [current.size, current.layout, current.offset, current.extent, current.horizontal, current.identity, rootRef, gridRef, onAnchor]);
}
