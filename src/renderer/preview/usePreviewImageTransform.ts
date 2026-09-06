import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { getRightDragTransform, initialPreviewImageTransform as initialTransform, maximumPreviewZoom as maximumZoom, minimumPreviewZoom as minimumZoom, previewZoomStep as zoomStep, type PreviewImageTransformState as ImageTransformState } from "./previewImageTransformMath";
const clamp = (value: number, limit: number) => Math.min(limit, Math.max(-limit, value));

export const usePreviewImageTransform = (sessionId: string, imageRef: React.RefObject<HTMLImageElement | null>, enabled: boolean) => {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState(initialTransform);
  const [gesture, setGesture] = useState<"pan" | "zoom" | null>(null);
  const dragStartRef = useRef<{ pointerId: number; mode: "pan" | "zoom"; x: number; y: number; transform: ImageTransformState; anchorX: number; anchorY: number } | null>(null);

  const getPanLimits = useCallback((zoom: number) => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || image.naturalWidth <= 0 || image.naturalHeight <= 0) return { x: 0, y: 0 };
    const bounds = canvas.getBoundingClientRect();
    const fit = Math.min(1, bounds.width / image.naturalWidth, bounds.height / image.naturalHeight);
    return {
      x: Math.max(0, (image.naturalWidth * fit * zoom - bounds.width) / 2),
      y: Math.max(0, (image.naturalHeight * fit * zoom - bounds.height) / 2)
    };
  }, [imageRef]);
  const clampTransform = useCallback((candidate: ImageTransformState): ImageTransformState => {
    const limits = getPanLimits(candidate.zoom);
    return { ...candidate, panX: clamp(candidate.panX, limits.x), panY: clamp(candidate.panY, limits.y) };
  }, [getPanLimits]);

  const reconcile = useCallback(() => setTransform((current) => clampTransform(current)), [clampTransform]);

  useEffect(() => {
    setTransform(initialTransform);
    dragStartRef.current = null;
    setGesture(null);
  }, [sessionId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!enabled || !canvas) return;
    const observer = new ResizeObserver(reconcile);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [enabled, reconcile]);

  const handleWheel = useCallback((event: ReactWheelEvent) => {
    if (!enabled || !event.ctrlKey) return false;
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const bounds = canvas.getBoundingClientRect();
    setTransform((current) => {
      const nextZoom = Math.min(maximumZoom, Math.max(minimumZoom, current.zoom * (event.deltaY < 0 ? zoomStep : 1 / zoomStep)));
      if (nextZoom === minimumZoom) return initialTransform;
      const ratio = nextZoom / current.zoom;
      const pointerX = event.clientX - bounds.left - bounds.width / 2;
      const pointerY = event.clientY - bounds.top - bounds.height / 2;
      return clampTransform({
        zoom: nextZoom,
        panX: pointerX - (pointerX - current.panX) * ratio,
        panY: pointerY - (pointerY - current.panY) * ratio
      });
    });
    return true;
  }, [clampTransform, enabled]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled || (event.button !== 0 && event.button !== 2)) return;
    const limits = getPanLimits(transform.zoom);
    if (event.button === 0 && limits.x <= 0 && limits.y <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = event.currentTarget.getBoundingClientRect();
    const mode = event.button === 2 ? "zoom" : "pan";
    dragStartRef.current = {
      pointerId: event.pointerId, mode, x: event.clientX, y: event.clientY, transform,
      anchorX: event.clientX - bounds.left - bounds.width / 2,
      anchorY: event.clientY - bounds.top - bounds.height / 2
    };
    setGesture(mode);
  }, [enabled, getPanLimits, transform]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (start.mode === "pan") {
      setTransform((current) => clampTransform({ ...current, panX: start.transform.panX + event.clientX - start.x, panY: start.transform.panY + event.clientY - start.y }));
      return;
    }
    setTransform(clampTransform(getRightDragTransform(start.transform, start.y, event.clientY, start.anchorX, start.anchorY)));
  }, [clampTransform]);

  const finishPointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current?.pointerId !== event.pointerId) return;
    dragStartRef.current = null;
    setGesture(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const panLimits = getPanLimits(transform.zoom);
  return {
    canvasRef,
    imageStyle: { transform: `translate3d(${transform.panX}px, ${transform.panY}px, 0) scale(${transform.zoom})` } as CSSProperties,
    zoomed: transform.zoom > minimumZoom,
    pannable: panLimits.x > 0 || panLimits.y > 0,
    dragging: gesture === "pan",
    zoomDragging: gesture === "zoom",
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    finishPointer,
    reset: () => setTransform(initialTransform),
    reconcile
  };
};
