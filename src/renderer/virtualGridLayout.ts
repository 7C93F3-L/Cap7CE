export type ResultLayoutMode = "micro" | "mini" | "normal";

export type ResultGridScrollMemory = {
  layoutMode: ResultLayoutMode;
  offset: number;
  progress: number;
  anchorItemId: string | null;
  atEnd: boolean;
};

export const createInitialResultGridScrollMemory = (): ResultGridScrollMemory => ({
  layoutMode: "normal",
  offset: 0,
  progress: 0,
  anchorItemId: null,
  atEnd: false
});

export const imageGridGap = 5;
export const imageGridOverscanRows = 2;
export const imageGridOverscanItems = 10;
export const imageGridTargetThumbSize = 150;

const microVisibleThumbCount = 5;
const miniDefaultColumnCount = 2;
const gridInteractionResumeDelayMs = 240;
let gridInteractionResumeTimer: number | null = null;

export const notifyGridInteraction = () => {
  void window.cap7ce?.cache.setGridInteractionActive(true);
  if (gridInteractionResumeTimer !== null) window.clearTimeout(gridInteractionResumeTimer);
  gridInteractionResumeTimer = window.setTimeout(() => {
    gridInteractionResumeTimer = null;
    void window.cap7ce?.cache.setGridInteractionActive(false);
  }, gridInteractionResumeDelayMs);
};

export const getResultLayoutMode = (shellState: string): ResultLayoutMode => (
  shellState === "micro" ? "micro" : shellState === "mini" ? "mini" : "normal"
);

export const getImageGridLayout = (layoutMode: ResultLayoutMode, viewportWidth: number, viewportHeight: number) => {
  const contentWidth = Math.max(0, viewportWidth);
  const isHorizontal = layoutMode === "micro";

  if (isHorizontal) {
    const columnCount = microVisibleThumbCount;
    const cellSize = Math.max(0, viewportHeight);
    return { cellSize, columnCount, contentWidth, isHorizontal };
  }

  const adaptiveColumnCount = Math.max(
    1,
    Math.floor((contentWidth + imageGridGap) / (imageGridTargetThumbSize + imageGridGap))
  );
  const columnCount = Math.max(layoutMode === "mini" ? miniDefaultColumnCount : 1, adaptiveColumnCount);
  const cellSize = Math.max(0, (contentWidth - (columnCount - 1) * imageGridGap) / columnCount);
  return { cellSize, columnCount, contentWidth, isHorizontal };
};

const clampScrollOffset = (offset: number, maxOffset: number) => (
  Math.min(Math.max(0, maxOffset), Math.max(0, offset))
);

const findNearestAnchorIndex = (itemIds: readonly (string | null)[], preferredIndex: number) => {
  if (itemIds.length === 0) return -1;
  const safeIndex = Math.min(itemIds.length - 1, Math.max(0, preferredIndex));
  for (let distance = 0; distance < itemIds.length; distance += 1) {
    const before = safeIndex - distance;
    if (before >= 0 && itemIds[before]) return before;
    const after = safeIndex + distance;
    if (distance > 0 && after < itemIds.length && itemIds[after]) return after;
  }
  return -1;
};

export const captureResultGridScrollMemory = ({
  layoutMode,
  offset,
  maxOffset,
  viewportExtent,
  cellSize,
  columnCount,
  itemIds
}: {
  layoutMode: ResultLayoutMode;
  offset: number;
  maxOffset: number;
  viewportExtent: number;
  cellSize: number;
  columnCount: number;
  itemIds: readonly (string | null)[];
}): ResultGridScrollMemory => {
  const safeMaxOffset = Math.max(0, maxOffset);
  const safeOffset = clampScrollOffset(offset, safeMaxOffset);
  const rowStride = cellSize + imageGridGap;
  const centerPosition = safeOffset + Math.max(0, viewportExtent) / 2;
  const centerRowOrItem = rowStride > 0 ? Math.floor(centerPosition / rowStride) : 0;
  const preferredIndex = layoutMode === "micro"
    ? centerRowOrItem
    : centerRowOrItem * Math.max(1, columnCount) + Math.floor(Math.max(1, columnCount) / 2);
  const anchorIndex = findNearestAnchorIndex(itemIds, preferredIndex);

  return {
    layoutMode,
    offset: safeOffset,
    progress: safeMaxOffset > 0 ? safeOffset / safeMaxOffset : 0,
    anchorItemId: anchorIndex >= 0 ? itemIds[anchorIndex] : null,
    atEnd: safeMaxOffset > 0 && safeMaxOffset - safeOffset <= 1
  };
};

export const restoreResultGridScrollOffset = ({
  memory,
  layoutMode,
  maxOffset,
  viewportExtent,
  cellSize,
  columnCount,
  itemIds
}: {
  memory: ResultGridScrollMemory;
  layoutMode: ResultLayoutMode;
  maxOffset: number;
  viewportExtent: number;
  cellSize: number;
  columnCount: number;
  itemIds: readonly (string | null)[];
}) => {
  const safeMaxOffset = Math.max(0, maxOffset);
  if (memory.layoutMode === layoutMode) {
    return clampScrollOffset(memory.offset, safeMaxOffset);
  }
  if (memory.atEnd) {
    return safeMaxOffset;
  }

  const anchorIndex = memory.anchorItemId ? itemIds.indexOf(memory.anchorItemId) : -1;
  if (anchorIndex >= 0) {
    const rowStride = cellSize + imageGridGap;
    const anchorPosition = layoutMode === "micro"
      ? anchorIndex * rowStride + cellSize / 2
      : Math.floor(anchorIndex / Math.max(1, columnCount)) * rowStride + cellSize / 2;
    return clampScrollOffset(anchorPosition - Math.max(0, viewportExtent) / 2, safeMaxOffset);
  }

  return clampScrollOffset(memory.progress * safeMaxOffset, safeMaxOffset);
};

type ScrollContainerMetrics = {
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
};

export const getScrollTopToRevealItem = (
  container: ScrollContainerMetrics,
  itemTop: number,
  itemHeight: number,
  edgeInset: number
) => {
  const currentTop = container.scrollTop;
  const visibleTop = currentTop + edgeInset;
  const visibleBottom = currentTop + container.clientHeight - edgeInset;
  const itemBottom = itemTop + itemHeight;
  if (itemTop < visibleTop) return Math.max(0, itemTop - edgeInset);
  if (itemBottom > visibleBottom) {
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    return Math.min(maxScrollTop, Math.max(0, itemBottom - container.clientHeight + edgeInset));
  }
  return currentTop;
};

export const getScrollLeftToRevealItem = (
  container: ScrollContainerMetrics,
  itemLeft: number,
  itemWidth: number,
  edgeInset: number
) => {
  const currentLeft = container.scrollLeft;
  const visibleLeft = currentLeft + edgeInset;
  const visibleRight = currentLeft + container.clientWidth - edgeInset;
  const itemRight = itemLeft + itemWidth;
  if (itemLeft < visibleLeft) return Math.max(0, itemLeft - edgeInset);
  if (itemRight > visibleRight) {
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    return Math.min(maxScrollLeft, Math.max(0, itemRight - container.clientWidth + edgeInset));
  }
  return currentLeft;
};
