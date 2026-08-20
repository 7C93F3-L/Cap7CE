import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type * as React from "react";
import { t } from "../../../electron/localization";
import type { ImageIndexItem } from "../../shared/types";
import CustomScrollbar from "../CustomScrollbar";
import { getDirectoryPath } from "../filePath";
import { formatCacheSize } from "../formatting";
import { ResultThumbnailContent, UnrecognizedThumbnail } from "./ResultThumbnail";
import {
  getImageGridLayout,
  getResultLayoutMode,
  getScrollLeftToRevealItem,
  getScrollTopToRevealItem,
  imageGridGap,
  imageGridOverscanItems,
  imageGridOverscanRows,
  notifyGridInteraction
} from "../virtualGridLayout";

export type ResultShellState = "standby" | "capsule" | "micro" | "mini" | "normal" | "settings";

export interface VirtualImageGridProps {
  shellState: ResultShellState;
  images: ImageIndexItem[];
  selectedImageIds: ReadonlySet<string>;
  isSpaceHolding: boolean;
  scrollTargetIndex: number | null;
  initialScrollTop: number;
  isSearching: boolean;
  searchError: string;
  onSelectImage: (event: React.MouseEvent, item: ImageIndexItem) => void;
  onScrollTopChange: (scrollTop: number) => void;
  onScrollTargetHandled: () => void;
  onContextMenu: (event: React.MouseEvent, item: ImageIndexItem) => void;
  onOpenImage: (item: ImageIndexItem) => void;
  onStartDrag: (event: React.DragEvent, item: ImageIndexItem) => void;
  onLayoutChange: (metrics: { left: number; right: number; columnCount: number }) => void;
  onOpenSkim: () => void;
}

const EmptySearchResult = ({ message, onOpenSkim }: { message: string; onOpenSkim: () => void }) => (
  <button className="empty-result-row cap-skim-empty-entry" type="button" onClick={onOpenSkim}>
    <span className="cap-empty-result-content">
      <span>{message}</span>
      <span>{t("skim.searchElsewhere")}</span>
    </span>
  </button>
);

export const VirtualImageGrid = ({ shellState, images, selectedImageIds, isSpaceHolding, scrollTargetIndex, initialScrollTop, isSearching, searchError, onSelectImage, onScrollTopChange, onScrollTargetHandled, onContextMenu, onOpenImage, onStartDrag, onLayoutChange, onOpenSkim }: VirtualImageGridProps) => {
  const containerRef = useRef<HTMLElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const pendingScrollTopRef = useRef(initialScrollTop);
  const restoredScrollTopRef = useRef(false);
  const viewportRef = useRef({ width: 0, height: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(initialScrollTop);
  const layoutMode = getResultLayoutMode(shellState);
  const isHorizontalGrid = layoutMode === "micro";
  const commitScrollTop = useCallback((nextScrollTop: number) => {
    pendingScrollTopRef.current = nextScrollTop;
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
    setScrollTop((currentScrollTop) => currentScrollTop === nextScrollTop ? currentScrollTop : nextScrollTop);
    onScrollTopChange(nextScrollTop);
  }, [onScrollTopChange]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measureViewport = () => {
      const nextViewport = {
        width: container.clientWidth,
        height: container.clientHeight
      };

      if (nextViewport.width !== viewportRef.current.width || nextViewport.height !== viewportRef.current.height) {
        viewportRef.current = nextViewport;
        setViewport(nextViewport);
      }
    };

    const scheduleViewportUpdate = () => {
      if (resizeFrameRef.current !== null) {
        return;
      }

      resizeFrameRef.current = window.requestAnimationFrame(() => {
        measureViewport();
        resizeFrameRef.current = null;
      });
    };

    measureViewport();
    const resizeObserver = new ResizeObserver(scheduleViewportUpdate);
    resizeObserver.observe(container);
    window.addEventListener("resize", scheduleViewportUpdate);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleViewportUpdate);
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  const handleScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    notifyGridInteraction();
    pendingScrollTopRef.current = isHorizontalGrid ? event.currentTarget.scrollLeft : event.currentTarget.scrollTop;
    if (scrollFrameRef.current !== null) {
      return;
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      const nextScrollTop = pendingScrollTopRef.current;
      setScrollTop(nextScrollTop);
      onScrollTopChange(nextScrollTop);
      scrollFrameRef.current = null;
    });
  }, [isHorizontalGrid, onScrollTopChange]);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLElement>) => {
    if (!isHorizontalGrid || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return;
    }

    event.preventDefault();
    const nextScrollLeft = event.currentTarget.scrollLeft + event.deltaY;
    event.currentTarget.scrollTo({ left: nextScrollLeft, behavior: "auto" });
  }, [isHorizontalGrid]);

  const virtualGrid = useMemo(() => {
    const gridLayout = getImageGridLayout(layoutMode, viewport.width, viewport.height);
    const { columnCount, contentWidth, isHorizontal } = gridLayout;
    const cellSize = gridLayout.cellSize;
    const rowStride = cellSize + imageGridGap;
    const effectiveColumnCount = isHorizontal ? Math.max(1, columnCount) : columnCount;
    const totalRows = isHorizontal ? (images.length > 0 ? 1 : 0) : Math.ceil(images.length / effectiveColumnCount);
    const totalHeight = totalRows > 0 ? totalRows * rowStride - imageGridGap : 0;
    const totalWidth = isHorizontal && images.length > 0
      ? images.length * rowStride - imageGridGap
      : contentWidth;
    const gridWidth = isHorizontal ? Math.max(viewport.width, totalWidth) : contentWidth;
    const leftOffset = 0;
    const firstVisibleRow = isHorizontal ? 0 : Math.max(0, Math.floor(scrollTop / rowStride) - imageGridOverscanRows);
    const lastVisibleRow = isHorizontal ? 0 : Math.min(totalRows - 1, Math.ceil((scrollTop + viewport.height) / rowStride) + imageGridOverscanRows);
    const firstVisibleIndex = isHorizontal ? Math.max(0, Math.floor(scrollTop / rowStride) - imageGridOverscanItems) : 0;
    const lastVisibleIndex = isHorizontal ? Math.min(images.length - 1, Math.ceil((scrollTop + viewport.width) / rowStride) + imageGridOverscanItems) : -1;
    const visibleItems: Array<{ item: ImageIndexItem; top: number; left: number }> = [];

    if (images.length === 0 || viewport.width === 0 || viewport.height === 0 || cellSize <= 0) {
      return {
        totalHeight,
        totalWidth,
        columnCount,
        cellSize,
        leftOffset: 0,
        gridWidth: viewport.width,
        visibleItems
      };
    }

    if (isHorizontal) {
      for (let index = firstVisibleIndex; index <= lastVisibleIndex; index += 1) {
        const item = images[index];
        if (!item) continue;

        visibleItems.push({
          item,
          top: 0,
          left: leftOffset + index * rowStride
        });
      }
    } else {
      for (let row = firstVisibleRow; row <= lastVisibleRow; row += 1) {
        for (let column = 0; column < effectiveColumnCount; column += 1) {
          const index = row * effectiveColumnCount + column;
          const item = images[index];
          if (!item) continue;

          visibleItems.push({
            item,
            top: row * rowStride,
            left: leftOffset + column * rowStride
          });
        }
      }
    }

    return {
      totalHeight,
      totalWidth,
      columnCount: effectiveColumnCount,
      cellSize,
      leftOffset,
      gridWidth,
      visibleItems
    };
  }, [images, layoutMode, scrollTop, viewport.height, viewport.width]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!restoredScrollTopRef.current) {
      if (viewport.width <= 0 || viewport.height <= 0) return;
      restoredScrollTopRef.current = true;
      const restoredScrollTop = Math.max(0, initialScrollTop);
      container.scrollTo(isHorizontalGrid ? { left: restoredScrollTop, behavior: "auto" } : { top: restoredScrollTop, behavior: "auto" });
      commitScrollTop(isHorizontalGrid ? container.scrollLeft : container.scrollTop);
      return;
    }
    commitScrollTop(isHorizontalGrid ? container.scrollLeft : container.scrollTop);
  }, [commitScrollTop, images.length, initialScrollTop, isHorizontalGrid, viewport.height, viewport.width, virtualGrid.totalHeight, virtualGrid.totalWidth]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || scrollTargetIndex === null || viewport.width === 0 || images.length === 0) {
      return;
    }

    const safeIndex = Math.min(images.length - 1, Math.max(0, scrollTargetIndex));
    const { cellSize, columnCount, isHorizontal } = getImageGridLayout(layoutMode, viewport.width, viewport.height);
    const effectiveCellSize = cellSize;
    const rowStride = effectiveCellSize + imageGridGap;
    const targetOffset = isHorizontal
      ? getScrollLeftToRevealItem(container, safeIndex * rowStride, effectiveCellSize, 0)
      : getScrollTopToRevealItem(container, Math.floor(safeIndex / columnCount) * rowStride, effectiveCellSize, 0);

    if (isHorizontal) {
      if (targetOffset !== container.scrollLeft) {
        container.scrollTo({ left: targetOffset, behavior: "auto" });
      }
    } else if (targetOffset !== container.scrollTop) {
      container.scrollTo({ top: targetOffset, behavior: "auto" });
    }
    commitScrollTop(targetOffset);
    onScrollTargetHandled();
  }, [commitScrollTop, images.length, layoutMode, onScrollTargetHandled, scrollTargetIndex, viewport.height, viewport.width]);

  useEffect(() => {
    onLayoutChange({
      left: virtualGrid.leftOffset,
      right: virtualGrid.leftOffset + virtualGrid.gridWidth,
      columnCount: virtualGrid.columnCount
    });
  }, [onLayoutChange, virtualGrid.columnCount, virtualGrid.gridWidth, virtualGrid.leftOffset]);

  return (
    <div className={`image-grid-frame cap-scroll-viewport-frame cap-scroll-viewport-frame-${isHorizontalGrid ? "horizontal" : "vertical"}`}>
      <section className="image-grid cap-main-scroll-viewport" aria-label={t("search.resultGridLabel")} ref={containerRef} onScroll={handleScroll} onWheel={handleWheel}>
      {searchError && <div className="empty-result-row">{searchError}</div>}
      {!isSearching && !searchError && images.length === 0 && (
        <EmptySearchResult message={t("search.emptyResult")} onOpenSkim={onOpenSkim} />
      )}
      {!searchError && images.length > 0 && (
        <div className="virtual-grid-spacer" style={{ height: virtualGrid.totalHeight, width: isHorizontalGrid ? virtualGrid.totalWidth : "100%" }} data-rendered-count={virtualGrid.visibleItems.length} data-column-count={virtualGrid.columnCount}>
          {virtualGrid.visibleItems.map(({ item, top, left }) => (
            <button
              className={`thumb${selectedImageIds.has(item.id) ? " selected" : ""}${isSpaceHolding && selectedImageIds.has(item.id) ? " is-space-holding" : ""}`}
              data-result-tile="true"
              data-result-item-id={item.id}
              key={item.id}
              style={{
                width: virtualGrid.cellSize,
                height: virtualGrid.cellSize,
                transform: `translate(${left}px, ${top}px)`
              }}
              aria-label={item.fileName}
              aria-pressed={selectedImageIds.has(item.id)}
              onClick={(event) => onSelectImage(event, item)}
              onDoubleClick={() => onOpenImage(item)}
              onContextMenu={(event) => onContextMenu(event, item)}
              draggable
              onDragStart={(event) => onStartDrag(event, item)}
            >
              <ResultThumbnailContent item={item} />
            </button>
          ))}
        </div>
      )}
      </section>
      <CustomScrollbar scrollContainerRef={containerRef} orientation={isHorizontalGrid ? "horizontal" : "vertical"} />
    </div>
  );
};
const unrecognizedRowHeight = 68;
const unrecognizedRowGap = 8;
const unrecognizedColumnGap = 8;
const unrecognizedPreferredMinColumnWidth = 420;
const unrecognizedMaxColumnCount = 4;
const unrecognizedListEdgeInset = 6;
const unrecognizedListOverscanRows = 4;
const unrecognizedListOverscanItems = 4;

const measureUnrecognizedViewport = (container: HTMLElement) => {
  const styles = window.getComputedStyle(container);
  const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
  return {
    width: Math.max(0, Math.floor(container.clientWidth - horizontalPadding)),
    height: container.clientHeight
  };
};

export const VirtualUnrecognizedList = ({ shellState, images, selectedImageIds, isSpaceHolding, scrollTargetIndex, initialScrollTop, isSearching, searchError, onSelectImage, onScrollTopChange, onScrollTargetHandled, onContextMenu, onOpenImage, onStartDrag, onLayoutChange, onOpenSkim }: VirtualImageGridProps) => {
  const containerRef = useRef<HTMLElement | null>(null);
  const viewportRef = useRef({ width: 0, height: 0 });
  const scrollFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const pendingScrollTopRef = useRef(initialScrollTop);
  const restoredScrollTopRef = useRef(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(initialScrollTop);
  const isHorizontalList = getResultLayoutMode(shellState) === "micro";

  const commitScrollTop = useCallback((nextScrollTop: number) => {
    pendingScrollTopRef.current = nextScrollTop;
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
    setScrollTop((currentScrollTop) => currentScrollTop === nextScrollTop ? currentScrollTop : nextScrollTop);
    onScrollTopChange(nextScrollTop);
  }, [onScrollTopChange]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measureViewport = () => {
      const nextViewport = measureUnrecognizedViewport(container);
      if (nextViewport.width !== viewportRef.current.width || nextViewport.height !== viewportRef.current.height) {
        viewportRef.current = nextViewport;
        setViewport(nextViewport);
      }
    };

    const scheduleViewportUpdate = () => {
      if (resizeFrameRef.current !== null) return;
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        measureViewport();
        resizeFrameRef.current = null;
      });
    };

    measureViewport();
    const resizeObserver = new ResizeObserver(scheduleViewportUpdate);
    resizeObserver.observe(container);
    window.addEventListener("resize", scheduleViewportUpdate);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleViewportUpdate);
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
      }
    };
  }, []);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }
  }, []);

  const handleScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    notifyGridInteraction();
    const nextViewport = measureUnrecognizedViewport(event.currentTarget);
    if (nextViewport.width !== viewportRef.current.width || nextViewport.height !== viewportRef.current.height) {
      viewportRef.current = nextViewport;
      setViewport(nextViewport);
    }
    pendingScrollTopRef.current = isHorizontalList ? event.currentTarget.scrollLeft : event.currentTarget.scrollTop;
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      const nextScrollTop = pendingScrollTopRef.current;
      setScrollTop(nextScrollTop);
      onScrollTopChange(nextScrollTop);
      scrollFrameRef.current = null;
    });
  }, [isHorizontalList, onScrollTopChange]);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLElement>) => {
    if (!isHorizontalList || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return;
    }

    event.preventDefault();
    event.currentTarget.scrollTo({ left: event.currentTarget.scrollLeft + event.deltaY, behavior: "auto" });
  }, [isHorizontalList]);

  const virtualList = useMemo(() => {
    const rowStride = unrecognizedRowHeight + unrecognizedRowGap;
    const availableWidth = Math.max(0, viewport.width - unrecognizedListEdgeInset * 2);
    if (isHorizontalList) {
      const itemWidth = availableWidth;
      const itemStride = itemWidth + unrecognizedColumnGap;
      const firstVisibleIndex = Math.max(0, Math.floor(scrollTop / Math.max(1, itemStride)) - unrecognizedListOverscanItems);
      const lastVisibleIndex = Math.min(
        images.length - 1,
        Math.ceil((scrollTop + viewport.width) / Math.max(1, itemStride)) + unrecognizedListOverscanItems
      );
      const itemTop = Math.max(
        unrecognizedListEdgeInset,
        Math.floor((viewport.height - unrecognizedRowHeight) / 2)
      );
      const visibleItems: Array<{ item: ImageIndexItem; top: number; left: number }> = [];

      for (let index = firstVisibleIndex; index <= lastVisibleIndex; index += 1) {
        const item = images[index];
        if (item) {
          visibleItems.push({
            item,
            top: itemTop,
            left: unrecognizedListEdgeInset + index * itemStride
          });
        }
      }

      return {
        columnCount: 1,
        contentWidth: itemWidth,
        itemWidth,
        leftOffset: unrecognizedListEdgeInset,
        totalHeight: Math.max(viewport.height, unrecognizedRowHeight + unrecognizedListEdgeInset * 2),
        totalWidth: images.length > 0
          ? images.length * itemStride - unrecognizedColumnGap + unrecognizedListEdgeInset * 2
          : 0,
        visibleItems
      };
    }
    const columnCount = Math.min(
      unrecognizedMaxColumnCount,
      Math.max(1, Math.floor((availableWidth + unrecognizedColumnGap) / (unrecognizedPreferredMinColumnWidth + unrecognizedColumnGap)))
    );
    const contentWidth = availableWidth;
    const itemWidth = Math.max(
      0,
      (contentWidth - (columnCount - 1) * unrecognizedColumnGap) / columnCount
    );
    const leftOffset = unrecognizedListEdgeInset;
    const totalRows = Math.ceil(images.length / columnCount);
    const firstVisibleRow = Math.max(0, Math.floor(scrollTop / rowStride) - unrecognizedListOverscanRows);
    const lastVisibleRow = Math.min(totalRows - 1, Math.ceil((scrollTop + viewport.height) / rowStride) + unrecognizedListOverscanRows);
    const visibleItems: Array<{ item: ImageIndexItem; top: number; left: number }> = [];

    for (let row = firstVisibleRow; row <= lastVisibleRow; row += 1) {
      for (let column = 0; column < columnCount; column += 1) {
        const index = row * columnCount + column;
        const item = images[index];
        if (item) {
          visibleItems.push({
            item,
            top: unrecognizedListEdgeInset + row * rowStride,
            left: leftOffset + column * (itemWidth + unrecognizedColumnGap)
          });
        }
      }
    }

    return {
      columnCount,
      contentWidth,
      itemWidth,
      leftOffset,
      totalHeight: totalRows > 0 ? totalRows * rowStride - unrecognizedRowGap + unrecognizedListEdgeInset * 2 : 0,
      totalWidth: viewport.width,
      visibleItems
    };
  }, [images, isHorizontalList, scrollTop, viewport.height, viewport.width]);

  useEffect(() => {
    onLayoutChange({
      left: virtualList.leftOffset,
      right: virtualList.leftOffset + virtualList.contentWidth,
      columnCount: virtualList.columnCount
    });
  }, [onLayoutChange, virtualList.columnCount, virtualList.contentWidth, virtualList.leftOffset]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!restoredScrollTopRef.current) {
      if (viewport.width <= 0 || viewport.height <= 0) return;
      restoredScrollTopRef.current = true;
      const restoredScrollTop = Math.max(0, initialScrollTop);
      container.scrollTo(isHorizontalList
        ? { left: restoredScrollTop, behavior: "auto" }
        : { top: restoredScrollTop, behavior: "auto" });
      commitScrollTop(isHorizontalList ? container.scrollLeft : container.scrollTop);
      return;
    }
    commitScrollTop(isHorizontalList ? container.scrollLeft : container.scrollTop);
  }, [commitScrollTop, images.length, initialScrollTop, isHorizontalList, viewport.height, viewport.width, virtualList.totalHeight, virtualList.totalWidth]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || scrollTargetIndex === null || images.length === 0) return;

    const safeIndex = Math.min(images.length - 1, Math.max(0, scrollTargetIndex));
    let targetOffset: number;
    if (isHorizontalList) {
      const itemStride = virtualList.itemWidth + unrecognizedColumnGap;
      const itemLeft = unrecognizedListEdgeInset + safeIndex * itemStride;
      targetOffset = getScrollLeftToRevealItem(container, itemLeft, virtualList.itemWidth, unrecognizedListEdgeInset);
      if (targetOffset !== container.scrollLeft) {
        container.scrollTo({ left: targetOffset, behavior: "auto" });
      }
    } else {
      const rowStride = unrecognizedRowHeight + unrecognizedRowGap;
      const row = Math.floor(safeIndex / virtualList.columnCount);
      const itemTop = unrecognizedListEdgeInset + row * rowStride;
      targetOffset = getScrollTopToRevealItem(container, itemTop, unrecognizedRowHeight, unrecognizedListEdgeInset);
      if (targetOffset !== container.scrollTop) {
        container.scrollTo({ top: targetOffset, behavior: "auto" });
      }
    }
    commitScrollTop(targetOffset);
    onScrollTargetHandled();
  }, [commitScrollTop, images.length, isHorizontalList, onScrollTargetHandled, scrollTargetIndex, viewport.height, virtualList.columnCount, virtualList.itemWidth]);

  return (
    <div className={`image-grid-frame cap-scroll-viewport-frame cap-scroll-viewport-frame-${isHorizontalList ? "horizontal" : "vertical"}`}>
      <section className="image-grid unrecognized-list cap-main-scroll-viewport" aria-label={t("search.unrecognizedGridLabel")} ref={containerRef} onScroll={handleScroll} onWheel={handleWheel}>
      {searchError && <div className="empty-result-row">{searchError}</div>}
      {!isSearching && !searchError && images.length === 0 && (
        <EmptySearchResult message={t("search.emptyUnrecognized")} onOpenSkim={onOpenSkim} />
      )}
      {!searchError && images.length > 0 && (
        <div
          className="virtual-unrecognized-spacer"
          style={{ height: virtualList.totalHeight, width: isHorizontalList ? virtualList.totalWidth : "100%" }}
          data-rendered-count={virtualList.visibleItems.length}
        >
          {virtualList.visibleItems.map(({ item, top, left }) => {
            const directoryPath = getDirectoryPath(item.filePath);
            return (
              <button
                className={`unrecognized-item${selectedImageIds.has(item.id) ? " selected" : ""}${isSpaceHolding && selectedImageIds.has(item.id) ? " is-space-holding" : ""}`}
                data-result-tile="true"
                data-result-item-id={item.id}
                key={item.id}
                style={{
                  width: virtualList.itemWidth,
                  transform: `translate(${left}px, ${top}px)`
                }}
                aria-pressed={selectedImageIds.has(item.id)}
                onClick={(event) => onSelectImage(event, item)}
                onDoubleClick={() => onOpenImage(item)}
                onContextMenu={(event) => onContextMenu(event, item)}
                draggable
                onDragStart={(event) => onStartDrag(event, item)}
              >
                <UnrecognizedThumbnail item={item} />
                <span className="unrecognized-details">
                  <strong title={item.fileName}>{item.fileName}</strong>
                  <span className="unrecognized-path" title={directoryPath}>{directoryPath}</span>
                  <span className="unrecognized-file-size">{formatCacheSize(item.fileSize)}</span>
                </span>
                <span className={`failure-type failure-type-${item.failureType}`}>{item.failureLabel || t("filter.unrecognized")}</span>
              </button>
            );
          })}
        </div>
      )}
      </section>
      <CustomScrollbar scrollContainerRef={containerRef} orientation={isHorizontalList ? "horizontal" : "vertical"} />
    </div>
  );
};
