import type { ImageIndexItem } from "../../shared/types";

// Historical evidence stays on each file; it no longer inserts heading/status tiles.
export type ResultGridLayoutItem = { kind: "file"; key: string; fileIndex: number; item: ImageIndexItem };

export const buildResultGridLayoutItems = (images: ImageIndexItem[]): ResultGridLayoutItem[] => (
  images.map((item, fileIndex) => ({ kind: "file", key: `file:${item.id}`, fileIndex, item }))
);

export const getResultLayoutIndexForFileIndex = (
  layoutItems: ResultGridLayoutItem[],
  fileIndex: number
) => layoutItems.findIndex((layoutItem) => layoutItem.kind === "file" && layoutItem.fileIndex === fileIndex);

export const getNavigatedResultFileIndex = (
  layoutItems: ResultGridLayoutItem[],
  currentFileIndex: number,
  direction: "left" | "right" | "up" | "down",
  columnCount: number
) => {
  const currentLayoutIndex = getResultLayoutIndexForFileIndex(layoutItems, currentFileIndex);
  if (currentLayoutIndex < 0) return currentFileIndex;
  const stride = direction === "up" || direction === "down" ? Math.max(1, columnCount) : 1;
  const step = direction === "left" || direction === "up" ? -1 : 1;
  let targetLayoutIndex = currentLayoutIndex + step * stride;

  while (targetLayoutIndex >= 0 && targetLayoutIndex < layoutItems.length) {
    const target = layoutItems[targetLayoutIndex];
    if (target.kind === "file") return target.fileIndex;
    targetLayoutIndex += step;
  }
  return currentFileIndex;
};
