export type ResultLayoutMode = "micro" | "mini" | "normal";

export const imageGridGap = 5;
export const imageGridOverscanRows = 2;
export const imageGridOverscanItems = 10;
export const imageGridTargetThumbSize = 150;

const microVisibleThumbCount = 5;
const miniDefaultColumnCount = 2;
const gridInteractionResumeDelayMs = 240;
let gridInteractionResumeTimer: number | null = null;

export const notifyGridInteraction = () => {
  void window.imageEverything?.cache.setGridInteractionActive(true);
  if (gridInteractionResumeTimer !== null) window.clearTimeout(gridInteractionResumeTimer);
  gridInteractionResumeTimer = window.setTimeout(() => {
    gridInteractionResumeTimer = null;
    void window.imageEverything?.cache.setGridInteractionActive(false);
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
