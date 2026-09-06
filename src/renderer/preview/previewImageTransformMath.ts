export const minimumPreviewZoom = 1;
export const maximumPreviewZoom = 6;
export const previewZoomStep = 1.18;
export const rightDragPixelsPerDoubling = 200;

export interface PreviewImageTransformState {
  zoom: number;
  panX: number;
  panY: number;
}

export const initialPreviewImageTransform: PreviewImageTransformState = { zoom: minimumPreviewZoom, panX: 0, panY: 0 };

export const getRightDragTransform = (
  start: PreviewImageTransformState,
  startY: number,
  currentY: number,
  anchorX: number,
  anchorY: number
): PreviewImageTransformState => {
  const zoom = Math.min(maximumPreviewZoom, Math.max(minimumPreviewZoom, start.zoom * 2 ** ((startY - currentY) / rightDragPixelsPerDoubling)));
  if (zoom === minimumPreviewZoom) return initialPreviewImageTransform;
  const ratio = zoom / start.zoom;
  return {
    zoom,
    panX: anchorX - (anchorX - start.panX) * ratio,
    panY: anchorY - (anchorY - start.panY) * ratio
  };
};
