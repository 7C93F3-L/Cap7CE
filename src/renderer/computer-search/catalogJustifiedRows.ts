import type { CatalogTilePosition } from "./catalogGridLayout";

// A caption has a fixed height; only the image area participates in the ratio.
export function catalogJustifiedRows(count: number, width: number, ratio: (index: number) => number, target = 200) {
  const gap = 8, caption = 28;
  const ratios = Array.from({ length: count }, (_, index) => {
    const value = ratio(index);
    return Number.isFinite(value) && value > 0 ? Math.max(.45, Math.min(2.4, value)) : 1;
  });
  const positions: CatalogTilePosition[] = [];
  let index = 0, top = 0;
  while (index < count) {
    const first = index;
    let sum = 0;
    do { sum += ratios[index++]; }
    while (index < count && target * sum + gap * (index - first - 1) < width);
    const length = index - first;
    if (length > 1 && target * sum + gap * (length - 1) >= width) {
      const previous = sum - ratios[index - 1];
      const withoutLast = (width - gap * (length - 2)) / previous;
      const withLast = (width - gap * (length - 1)) / sum;
      if (Math.abs(withoutLast - target) < Math.abs(withLast - target)) { index--; sum = previous; }
    }
    const fitted = Math.max(1, (width - gap * (index - first - 1)) / sum);
    const imageHeight = index === count ? Math.min(target, fitted) : fitted;
    let left = 0;
    for (let item = first; item < index; item++) {
      const tileWidth = ratios[item] * imageHeight;
      positions.push({ index: item, left, top, width: tileWidth, height: imageHeight + caption });
      left += tileWidth + gap;
    }
    top += imageHeight + caption + gap;
  }
  return { positions, height: count ? top - gap : 0 };
}
