import { catalogJustifiedRows } from "./catalogJustifiedRows";
import { normalizeCatalogGridSize } from "../../../electron/catalogGridSizeRules";

export interface CatalogTilePosition { index: number; left: number; top: number; width: number; height: number }

// Geometry contains no source reads, authorization, React state or thumbnails.
export function catalogGridLayout(count: number, width: number, horizontal: boolean, gallery: boolean,
  ratio: (index: number) => number, size = 100, compactHeight = Infinity) {
  const gap = gallery ? 8 : 5;
  const scale = normalizeCatalogGridSize(size) / 100;
  const columns = Math.max(gallery || horizontal ? 1 : 2, Math.floor((width + gap) / (150 * scale + gap)));
  const cell = horizontal ? Math.max(1, Math.min(138 * scale, compactHeight)) : Math.max(1, (width - (columns - 1) * gap) / columns);
  if (!gallery || horizontal) {
    const stride = cell + gap;
    const position = (index: number): CatalogTilePosition | undefined => index < 0 || index >= count ? undefined : {
      index, left: horizontal ? index * stride : index % columns * stride,
      top: horizontal ? 0 : Math.floor(index / columns) * stride, width: cell, height: cell };
    return { height: horizontal ? cell : Math.max(0, Math.ceil(count / columns) * stride - gap), position,
      width: horizontal ? Math.max(0, count * stride - gap) : width,
      visible(start: number, extent: number): CatalogTilePosition[] {
        const first = Math.max(0, Math.floor(start / stride) - 2) * (horizontal ? 1 : columns);
        const end = Math.min(count, (Math.ceil((start + extent) / stride) + 2) * (horizontal ? 1 : columns));
        return Array.from({ length: Math.max(0, end - first) }, (_, offset) => {
          const index = first + offset;
          return position(index)!;
        });
      } };
  }
  const { positions, height } = catalogJustifiedRows(count, width, ratio, 200 * scale, width < 300 + gap ? 2 : 1), buffer = 200 * scale + 36;
  return { height, width, position: (index: number): CatalogTilePosition | undefined => positions[index],
    visible(start: number, extent: number) {
      let low = 0, high = positions.length;
      while (low < high) { const middle = (low + high) >>> 1;
        if (positions[middle].top + positions[middle].height < start - buffer) low = middle + 1; else high = middle;
      }
      const first = low;
      while (low < positions.length && positions[low].top <= start + extent + buffer) low++;
      return positions.slice(first, low);
    } };
}
