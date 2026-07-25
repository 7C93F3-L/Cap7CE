import type { Layer, Psd } from "ag-psd";

export interface PsdArtboardBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

const minimumArtboardDimension = 64;
const minimumArtboardAreaRatio = 0.01;
const maximumArtboardAspectRatio = 50;

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === "number" && Number.isFinite(value)
);

const isTopLevelArtboard = (
  layer: Layer
): layer is Layer & { artboard: NonNullable<Layer["artboard"]> } => (
  layer.artboard !== undefined
);

export const getReliableFirstPsdArtboardBounds = (
  psd: Pick<Psd, "width" | "height" | "children" | "artboards">
): PsdArtboardBounds | null => {
  const documentWidth = psd.width;
  const documentHeight = psd.height;
  const declaredArtboardCount = psd.artboards?.count ?? 0;
  if (
    !isFiniteNumber(documentWidth)
    || !isFiniteNumber(documentHeight)
    || documentWidth <= 0
    || documentHeight <= 0
    || declaredArtboardCount < 2
  ) {
    return null;
  }

  const topLevelArtboards = (psd.children ?? []).filter(isTopLevelArtboard);
  if (
    topLevelArtboards.length < 2
    || topLevelArtboards.length !== declaredArtboardCount
  ) {
    return null;
  }

  const rect = topLevelArtboards[0].artboard.rect;
  if (
    !isFiniteNumber(rect.left)
    || !isFiniteNumber(rect.top)
    || !isFiniteNumber(rect.right)
    || !isFiniteNumber(rect.bottom)
  ) {
    return null;
  }

  const left = Math.floor(rect.left);
  const top = Math.floor(rect.top);
  const right = Math.ceil(rect.right);
  const bottom = Math.ceil(rect.bottom);
  const width = right - left;
  const height = bottom - top;
  if (
    left < 0
    || top < 0
    || right > documentWidth
    || bottom > documentHeight
    || width < minimumArtboardDimension
    || height < minimumArtboardDimension
  ) {
    return null;
  }

  const areaRatio = (width * height) / (documentWidth * documentHeight);
  const aspectRatio = Math.max(width / height, height / width);
  if (
    areaRatio < minimumArtboardAreaRatio
    || aspectRatio > maximumArtboardAspectRatio
  ) {
    return null;
  }

  return { left, top, width, height };
};
