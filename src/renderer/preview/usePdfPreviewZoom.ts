import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject, type WheelEvent as ReactWheelEvent } from "react";

const minimumPdfZoom = 0.75;
const maximumPdfZoom = 2;
const pdfZoomStep = 1.2;
const rightDragPixelsPerDoubling = 200;

interface PdfZoomAnchor {
  pageNumber: string;
  pageX: number;
  pageY: number;
  viewportX: number;
  viewportY: number;
}

type PdfPointerGesture = {
  mode: "pan";
  pointerId: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollTop: number;
} | {
  mode: "zoom";
  pointerId: number;
  startY: number;
  startZoom: number;
  anchor: PdfZoomAnchor | null;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export const usePdfPreviewZoom = (sessionId: string, scrollRef: RefObject<HTMLDivElement | null>) => {
  const [zoom, setZoom] = useState(1);
  const [gesture, setGesture] = useState<"pan" | "zoom" | null>(null);
  const pendingAnchorRef = useRef<PdfZoomAnchor | null>(null);
  const dragRef = useRef<PdfPointerGesture | null>(null);

  const captureAnchor = useCallback((clientX: number, clientY: number): PdfZoomAnchor | null => {
    const root = scrollRef.current;
    if (!root) return null;
    const rootBounds = root.getBoundingClientRect();
    const pages = [...root.querySelectorAll<HTMLElement>("[data-pdf-page]")];
    const pointedPage = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-pdf-page]");
    const page = pointedPage && root.contains(pointedPage)
      ? pointedPage
      : pages.reduce<HTMLElement | null>((closest, candidate) => {
        const bounds = candidate.getBoundingClientRect();
        const distance = Math.abs(bounds.top + bounds.height / 2 - clientY);
        if (!closest) return candidate;
        const closestBounds = closest.getBoundingClientRect();
        return distance < Math.abs(closestBounds.top + closestBounds.height / 2 - clientY) ? candidate : closest;
      }, null);
    if (!page?.dataset.pdfPage) return null;
    const pageBounds = page.getBoundingClientRect();
    return {
      pageNumber: page.dataset.pdfPage,
      pageX: clamp((clientX - pageBounds.left) / pageBounds.width, 0, 1),
      pageY: clamp((clientY - pageBounds.top) / pageBounds.height, 0, 1),
      viewportX: clientX - rootBounds.left,
      viewportY: clientY - rootBounds.top
    };
  }, [scrollRef]);

  const captureViewportCenter = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return null;
    const bounds = root.getBoundingClientRect();
    return captureAnchor(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
  }, [captureAnchor, scrollRef]);

  const commitZoom = useCallback((candidate: number, anchor: PdfZoomAnchor | null) => {
    const nextZoom = clamp(candidate, minimumPdfZoom, maximumPdfZoom);
    if (Math.abs(nextZoom - zoom) < 0.001) return;
    pendingAnchorRef.current = anchor;
    setZoom(nextZoom);
  }, [zoom]);

  useLayoutEffect(() => {
    const root = scrollRef.current;
    const anchor = pendingAnchorRef.current;
    pendingAnchorRef.current = null;
    if (!root || !anchor) return;
    const page = root.querySelector<HTMLElement>(`[data-pdf-page="${anchor.pageNumber}"]`);
    if (!page) return;
    const rootBounds = root.getBoundingClientRect();
    const pageBounds = page.getBoundingClientRect();
    root.scrollLeft += pageBounds.left + pageBounds.width * anchor.pageX - rootBounds.left - anchor.viewportX;
    root.scrollTop += pageBounds.top + pageBounds.height * anchor.pageY - rootBounds.top - anchor.viewportY;
  }, [scrollRef, zoom]);

  useEffect(() => {
    setZoom(1);
    setGesture(null);
    pendingAnchorRef.current = null;
    dragRef.current = null;
  }, [sessionId]);

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    commitZoom(zoom * (event.deltaY < 0 ? pdfZoomStep : 1 / pdfZoomStep), captureAnchor(event.clientX, event.clientY));
  }, [captureAnchor, commitZoom, zoom]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 2) return;
    if (event.button === 0 && zoom <= 1) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.button === 0) {
      dragRef.current = {
        mode: "pan",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startScrollLeft: event.currentTarget.scrollLeft,
        startScrollTop: event.currentTarget.scrollTop
      };
      setGesture("pan");
      return;
    }
    dragRef.current = { mode: "zoom", pointerId: event.pointerId, startY: event.clientY, startZoom: zoom, anchor: captureAnchor(event.clientX, event.clientY) };
    setGesture("zoom");
  }, [captureAnchor, zoom]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (drag.mode === "pan") {
      event.currentTarget.scrollLeft = drag.startScrollLeft + drag.startX - event.clientX;
      event.currentTarget.scrollTop = drag.startScrollTop + drag.startY - event.clientY;
      return;
    }
    commitZoom(drag.startZoom * 2 ** ((drag.startY - event.clientY) / rightDragPixelsPerDoubling), drag.anchor);
  }, [commitZoom]);

  const finishPointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setGesture(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return {
    zoom,
    zoomPercent: Math.round(zoom * 100),
    pannable: zoom > 1,
    dragging: gesture === "pan",
    zoomDragging: gesture === "zoom",
    atMinimum: zoom <= minimumPdfZoom,
    atMaximum: zoom >= maximumPdfZoom,
    zoomOut: () => commitZoom(zoom / pdfZoomStep, captureViewportCenter()),
    zoomIn: () => commitZoom(zoom * pdfZoomStep, captureViewportCenter()),
    resetZoom: () => commitZoom(1, captureViewportCenter()),
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    finishPointer
  };
};
