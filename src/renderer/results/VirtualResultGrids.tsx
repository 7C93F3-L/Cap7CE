import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type * as React from "react";
import { t } from "../../../electron/localization";
import type { ImageIndexItem } from "../../shared/types";
import CustomScrollbar from "../CustomScrollbar";
import { ResultThumbnailContent } from "./ResultThumbnail";
import { ResultSectionCard, type AiResultSectionPhase, type AiResultSectionProgress } from "./ResultSectionCard";
import { getResultLayoutIndexForFileIndex, type ResultGridLayoutItem } from "./resultSectionLayout";
import {
  captureResultGridScrollMemory,
  getImageGridLayout,
  getResultLayoutMode,
  getScrollLeftToRevealItem,
  getScrollTopToRevealItem,
  imageGridGap,
  imageGridOverscanItems,
  imageGridOverscanRows,
  notifyGridInteraction,
  restoreResultGridScrollOffset,
  type ResultGridScrollMemory,
  type ResultLayoutMode
} from "../virtualGridLayout";

export type ResultShellState = "standby" | "capsule" | "micro" | "mini" | "normal" | "settings";

export interface VirtualImageGridProps {
  shellState: ResultShellState;
  images: ImageIndexItem[];
  layoutItems?: ResultGridLayoutItem[];
  selectedImageIds: ReadonlySet<string>;
  isSpaceHolding: boolean;
  scrollTargetIndex: number | null;
  initialScrollMemory: ResultGridScrollMemory;
  isSearching: boolean;
  aiSearchPhase: AiResultSectionPhase;
  aiSearchProgress: AiResultSectionProgress;
  searchError: string;
  onSelectImage: (event: React.MouseEvent, item: ImageIndexItem) => void;
  onScrollMemoryChange: (memory: ResultGridScrollMemory) => void;
  onScrollTargetHandled: () => void;
  onContextMenu: (event: React.MouseEvent, item: ImageIndexItem) => void;
  onOpenImage: (item: ImageIndexItem) => void;
  onStartDrag: (event: React.DragEvent, item: ImageIndexItem) => void;
  onLayoutChange: (metrics: { left: number; right: number; columnCount: number }) => void;
  onOpenSkim: () => void;
  onAiSearchSectionToggle: () => void;
}

const EmptySearchResult = ({ message, onOpenSkim }: { message: string; onOpenSkim: () => void }) => (
  <button className="empty-result-row cap-skim-empty-entry" type="button" onClick={onOpenSkim}>
    <span className="cap-empty-result-content">
      <span>{message}</span>
      <span>{t("skim.searchElsewhere")}</span>
    </span>
  </button>
);

export const VirtualImageGrid = ({ shellState, images, layoutItems, selectedImageIds, isSpaceHolding, scrollTargetIndex, initialScrollMemory, isSearching, aiSearchPhase, aiSearchProgress, searchError, onSelectImage, onScrollMemoryChange, onScrollTargetHandled, onContextMenu, onOpenImage, onStartDrag, onLayoutChange, onOpenSkim, onAiSearchSectionToggle }: VirtualImageGridProps) => {
  const containerRef = useRef<HTMLElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const restoreFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const pendingScrollTopRef = useRef(initialScrollMemory.offset);
  const scrollMemoryRef = useRef(initialScrollMemory);
  const restoredLayoutModeRef = useRef<ResultLayoutMode | null>(null);
  const restoreSourceMemoryRef = useRef<ResultGridScrollMemory | null>(null);
  const restoreTargetModeRef = useRef<ResultLayoutMode | null>(null);
  const viewportRef = useRef({ width: 0, height: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(initialScrollMemory.offset);
  const gridItems = useMemo<ResultGridLayoutItem[]>(() => layoutItems ?? images.map((item, fileIndex) => ({
    kind: "file",
    key: `file:${item.id}`,
    fileIndex,
    item
  })), [images, layoutItems]);
  const layoutItemIds = useMemo(
    () => gridItems.map((layoutItem) => layoutItem.kind === "file" ? layoutItem.item.id : null),
    [gridItems]
  );
  const hasGridItems = gridItems.length > 0;
  const layoutMode = getResultLayoutMode(shellState);
  const isHorizontalGrid = layoutMode === "micro";
  const captureScrollMemory = useCallback((container: HTMLElement, nextScrollTop: number) => {
    const { cellSize, columnCount, isHorizontal } = getImageGridLayout(
      layoutMode,
      container.clientWidth,
      container.clientHeight
    );
    return captureResultGridScrollMemory({
      layoutMode,
      offset: nextScrollTop,
      maxOffset: isHorizontal
        ? container.scrollWidth - container.clientWidth
        : container.scrollHeight - container.clientHeight,
      viewportExtent: isHorizontal ? container.clientWidth : container.clientHeight,
      cellSize,
      columnCount,
      itemIds: layoutItemIds
    });
  }, [layoutItemIds, layoutMode]);
  const commitScrollTop = useCallback((container: HTMLElement, nextScrollTop: number) => {
    pendingScrollTopRef.current = nextScrollTop;
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
    setScrollTop((currentScrollTop) => currentScrollTop === nextScrollTop ? currentScrollTop : nextScrollTop);
    const nextMemory = captureScrollMemory(container, nextScrollTop);
    scrollMemoryRef.current = nextMemory;
    onScrollMemoryChange(nextMemory);
  }, [captureScrollMemory, onScrollMemoryChange]);

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
      if (restoreFrameRef.current !== null) {
        window.cancelAnimationFrame(restoreFrameRef.current);
      }
    };
  }, []);

  const handleScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    notifyGridInteraction();
    const container = event.currentTarget;
    pendingScrollTopRef.current = isHorizontalGrid ? container.scrollLeft : container.scrollTop;
    const nextMemory = captureScrollMemory(container, pendingScrollTopRef.current);
    scrollMemoryRef.current = nextMemory;
    onScrollMemoryChange(nextMemory);
    if (scrollFrameRef.current !== null) {
      return;
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      const nextScrollTop = pendingScrollTopRef.current;
      setScrollTop(nextScrollTop);
      scrollFrameRef.current = null;
    });
  }, [captureScrollMemory, isHorizontalGrid, onScrollMemoryChange]);

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
    const totalRows = isHorizontal ? (gridItems.length > 0 ? 1 : 0) : Math.ceil(gridItems.length / effectiveColumnCount);
    const totalHeight = totalRows > 0 ? totalRows * rowStride - imageGridGap : 0;
    const totalWidth = isHorizontal && gridItems.length > 0
      ? gridItems.length * rowStride - imageGridGap
      : contentWidth;
    const gridWidth = isHorizontal ? Math.max(viewport.width, totalWidth) : contentWidth;
    const leftOffset = 0;
    const firstVisibleRow = isHorizontal ? 0 : Math.max(0, Math.floor(scrollTop / rowStride) - imageGridOverscanRows);
    const lastVisibleRow = isHorizontal ? 0 : Math.min(totalRows - 1, Math.ceil((scrollTop + viewport.height) / rowStride) + imageGridOverscanRows);
    const firstVisibleIndex = isHorizontal ? Math.max(0, Math.floor(scrollTop / rowStride) - imageGridOverscanItems) : 0;
    const lastVisibleIndex = isHorizontal ? Math.min(gridItems.length - 1, Math.ceil((scrollTop + viewport.width) / rowStride) + imageGridOverscanItems) : -1;
    const visibleItems: Array<{ layoutItem: ResultGridLayoutItem; top: number; left: number }> = [];

    if (gridItems.length === 0 || viewport.width === 0 || viewport.height === 0 || cellSize <= 0) {
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
        const layoutItem = gridItems[index];
        if (!layoutItem) continue;

        visibleItems.push({
          layoutItem,
          top: 0,
          left: leftOffset + index * rowStride
        });
      }
    } else {
      for (let row = firstVisibleRow; row <= lastVisibleRow; row += 1) {
        for (let column = 0; column < effectiveColumnCount; column += 1) {
          const index = row * effectiveColumnCount + column;
          const layoutItem = gridItems[index];
          if (!layoutItem) continue;

          visibleItems.push({
            layoutItem,
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
  }, [gridItems, layoutMode, scrollTop, viewport.height, viewport.width]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (restoredLayoutModeRef.current !== layoutMode) {
      if (viewport.width <= 0 || viewport.height <= 0) return;
      if (restoreTargetModeRef.current !== layoutMode) {
        restoreSourceMemoryRef.current = scrollMemoryRef.current;
        restoreTargetModeRef.current = layoutMode;
      }
      restoreFrameRef.current = window.requestAnimationFrame(() => {
        restoreFrameRef.current = window.requestAnimationFrame(() => {
          restoreFrameRef.current = null;
          const settledContainer = containerRef.current;
          if (!settledContainer) return;
          const { cellSize, columnCount, isHorizontal } = getImageGridLayout(
            layoutMode,
            settledContainer.clientWidth,
            settledContainer.clientHeight
          );
          const restoredScrollTop = restoreResultGridScrollOffset({
            memory: restoreSourceMemoryRef.current ?? scrollMemoryRef.current,
            layoutMode,
            maxOffset: isHorizontal
              ? settledContainer.scrollWidth - settledContainer.clientWidth
              : settledContainer.scrollHeight - settledContainer.clientHeight,
            viewportExtent: isHorizontal ? settledContainer.clientWidth : settledContainer.clientHeight,
            cellSize,
            columnCount,
            itemIds: layoutItemIds
          });
          restoredLayoutModeRef.current = layoutMode;
          restoreSourceMemoryRef.current = null;
          restoreTargetModeRef.current = null;
          settledContainer.scrollTo(isHorizontalGrid ? { left: restoredScrollTop, behavior: "auto" } : { top: restoredScrollTop, behavior: "auto" });
          commitScrollTop(settledContainer, isHorizontalGrid ? settledContainer.scrollLeft : settledContainer.scrollTop);
        });
      });
      return () => {
        if (restoreFrameRef.current !== null) {
          window.cancelAnimationFrame(restoreFrameRef.current);
          restoreFrameRef.current = null;
        }
      };
    }
    commitScrollTop(container, isHorizontalGrid ? container.scrollLeft : container.scrollTop);
  }, [commitScrollTop, images.length, isHorizontalGrid, layoutItemIds, layoutMode, viewport.height, viewport.width, virtualGrid.totalHeight, virtualGrid.totalWidth]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || scrollTargetIndex === null || viewport.width === 0 || images.length === 0) {
      return;
    }

    const safeIndex = Math.min(images.length - 1, Math.max(0, scrollTargetIndex));
    const targetLayoutIndex = getResultLayoutIndexForFileIndex(gridItems, safeIndex);
    if (targetLayoutIndex < 0) return;
    const { cellSize, columnCount, isHorizontal } = getImageGridLayout(layoutMode, viewport.width, viewport.height);
    const effectiveCellSize = cellSize;
    const rowStride = effectiveCellSize + imageGridGap;
    const targetOffset = isHorizontal
      ? getScrollLeftToRevealItem(container, targetLayoutIndex * rowStride, effectiveCellSize, 0)
      : getScrollTopToRevealItem(container, Math.floor(targetLayoutIndex / columnCount) * rowStride, effectiveCellSize, 0);

    if (isHorizontal) {
      if (targetOffset !== container.scrollLeft) {
        container.scrollTo({ left: targetOffset, behavior: "auto" });
      }
    } else if (targetOffset !== container.scrollTop) {
      container.scrollTo({ top: targetOffset, behavior: "auto" });
    }
    commitScrollTop(container, targetOffset);
    onScrollTargetHandled();
  }, [commitScrollTop, gridItems, images.length, layoutMode, onScrollTargetHandled, scrollTargetIndex, viewport.height, viewport.width]);

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
      {!isSearching && !searchError && !hasGridItems && (
        <EmptySearchResult message={t("search.emptyResult")} onOpenSkim={onOpenSkim} />
      )}
      {!searchError && hasGridItems && (
        <div className="virtual-grid-spacer" style={{ height: virtualGrid.totalHeight, width: isHorizontalGrid ? virtualGrid.totalWidth : "100%" }} data-rendered-count={virtualGrid.visibleItems.length} data-column-count={virtualGrid.columnCount}>
          {virtualGrid.visibleItems.map(({ layoutItem, top, left }) => layoutItem.kind === "section" ? (
            <div
              className="result-section-layout-cell"
              key={layoutItem.key}
              style={{
                width: virtualGrid.cellSize,
                height: virtualGrid.cellSize,
                transform: `translate(${left}px, ${top}px)`
              }}
            >
              <ResultSectionCard
                section={layoutItem.section}
                aiPhase={layoutItem.section === "aiDeepMatch" ? aiSearchPhase : "idle"}
                aiProgress={layoutItem.section === "aiDeepMatch" ? aiSearchProgress : undefined}
                onAiToggle={layoutItem.section === "aiDeepMatch" ? onAiSearchSectionToggle : undefined}
              />
            </div>
          ) : (
            <button
              className={`thumb${selectedImageIds.has(layoutItem.item.id) ? " selected" : ""}${isSpaceHolding && selectedImageIds.has(layoutItem.item.id) ? " is-space-holding" : ""}`}
              data-result-tile="true"
              data-result-item-id={layoutItem.item.id}
              key={layoutItem.key}
              style={{
                width: virtualGrid.cellSize,
                height: virtualGrid.cellSize,
                transform: `translate(${left}px, ${top}px)`
              }}
              aria-label={layoutItem.item.fileName}
              aria-pressed={selectedImageIds.has(layoutItem.item.id)}
              onClick={(event) => onSelectImage(event, layoutItem.item)}
              onDoubleClick={() => onOpenImage(layoutItem.item)}
              onContextMenu={(event) => onContextMenu(event, layoutItem.item)}
              draggable
              onDragStart={(event) => onStartDrag(event, layoutItem.item)}
            >
              <ResultThumbnailContent item={layoutItem.item} />
            </button>
          ))}
        </div>
      )}
      </section>
      <CustomScrollbar scrollContainerRef={containerRef} orientation={isHorizontalGrid ? "horizontal" : "vertical"} />
    </div>
  );
};
