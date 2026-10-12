import { catalogJustifiedRows } from "./catalogJustifiedRows";

export interface CatalogTilePosition { index: number; left: number; top: number; width: number; height: number }

// Geometry contains no source reads, authorization, React state or thumbnails.
export function catalogGridLayout(count: number, width: number, horizontal: boolean, gallery: boolean,
  ratio: (index: number) => number) {
  const gap = gallery ? 8 : 5;
  const columns = Math.max(1, Math.floor((width + gap) / 155));
  const cell = horizontal ? 138 : Math.max(1, (width - (columns - 1) * gap) / columns);
  if (!gallery || horizontal) {
    const stride = cell + gap;
    return { height: horizontal ? 138 : Math.max(0, Math.ceil(count / columns) * stride - gap),
      width: horizontal ? Math.max(0, count * stride - gap) : width,
      visible(start: number, extent: number): CatalogTilePosition[] {
        const first = Math.max(0, Math.floor(start / stride) - 2) * (horizontal ? 1 : columns);
        const end = Math.min(count, (Math.ceil((start + extent) / stride) + 2) * (horizontal ? 1 : columns));
        return Array.from({ length: Math.max(0, end - first) }, (_, offset) => {
          const index = first + offset;
          return { index, left: horizontal ? index * stride : index % columns * stride,
            top: horizontal ? 0 : Math.floor(index / columns) * stride, width: cell, height: cell };
        });
      } };
  }
  const { positions, height } = catalogJustifiedRows(count, width, ratio);
  return { height, width,
    visible(start: number, extent: number) {
      let low = 0, high = positions.length;
      while (low < high) { const middle = (low + high) >>> 1;
        if (positions[middle].top + positions[middle].height < start - 236) low = middle + 1; else high = middle;
      }
      const first = low;
      while (low < positions.length && positions[low].top <= start + extent + 236) low++;
      return positions.slice(first, low);
    } };
}
