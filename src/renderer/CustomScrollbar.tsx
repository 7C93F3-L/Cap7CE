import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

type CustomScrollbarMetrics = {
  visible: boolean;
  thumbSize: number;
  thumbOffset: number;
  maxScrollOffset: number;
  scrollOffset: number;
};

type CustomScrollbarDrag = {
  pointerId: number;
  startPointerCoordinate: number;
  startThumbOffset: number;
  maxThumbOffset: number;
  maxScrollOffset: number;
};

export type CustomScrollbarOrientation = "vertical" | "horizontal";

const customScrollbarMinThumbSize = {
  vertical: 56,
  horizontal: 56
} as const;
const customScrollbarHideDelayMs = 2000;

const CustomScrollbar = ({ scrollContainerRef, orientation }: {
  scrollContainerRef: RefObject<HTMLElement | null>;
  orientation: CustomScrollbarOrientation;
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const measureFrameRef = useRef<number | null>(null);
  const dragRef = useRef<CustomScrollbarDrag | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const pointerOverRef = useRef(false);
  const [isActive, setIsActive] = useState(false);
  const [metrics, setMetrics] = useState<CustomScrollbarMetrics>({
    visible: false,
    thumbSize: 0,
    thumbOffset: 0,
    maxScrollOffset: 0,
    scrollOffset: 0
  });

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      if (!dragRef.current && !pointerOverRef.current) {
        setIsActive(false);
      }
    }, customScrollbarHideDelayMs);
  }, [clearHideTimer]);

  const revealScrollbar = useCallback((autoHide = true) => {
    clearHideTimer();
    setIsActive(true);
    if (autoHide && !dragRef.current && !pointerOverRef.current) {
      scheduleHide();
    }
  }, [clearHideTimer, scheduleHide]);

  const measure = useCallback(() => {
    const container = scrollContainerRef.current;
    const track = trackRef.current;
    if (!container || !track) return;

    const trackSize = orientation === "vertical" ? track.clientHeight : track.clientWidth;
    const clientSize = orientation === "vertical" ? container.clientHeight : container.clientWidth;
    const scrollSize = orientation === "vertical" ? container.scrollHeight : container.scrollWidth;
    const rawScrollOffset = orientation === "vertical" ? container.scrollTop : container.scrollLeft;
    const maxScrollOffset = Math.max(0, scrollSize - clientSize);
    if (trackSize <= 0 || clientSize <= 0 || maxScrollOffset <= 1) {
      setMetrics((current) => current.visible
        ? { visible: false, thumbSize: 0, thumbOffset: 0, maxScrollOffset: 0, scrollOffset: 0 }
        : current);
      return;
    }

    const thumbSize = Math.min(
      trackSize,
      Math.max(customScrollbarMinThumbSize[orientation], (clientSize / scrollSize) * trackSize)
    );
    const maxThumbOffset = Math.max(0, trackSize - thumbSize);
    const scrollOffset = Math.min(maxScrollOffset, Math.max(0, rawScrollOffset));
    const thumbOffset = maxScrollOffset > 0 ? (scrollOffset / maxScrollOffset) * maxThumbOffset : 0;
    const nextMetrics = { visible: true, thumbSize, thumbOffset, maxScrollOffset, scrollOffset };

    setMetrics((current) => (
      current.visible === nextMetrics.visible
      && Math.abs(current.thumbSize - nextMetrics.thumbSize) < 0.25
      && Math.abs(current.thumbOffset - nextMetrics.thumbOffset) < 0.25
      && Math.abs(current.maxScrollOffset - nextMetrics.maxScrollOffset) < 0.25
      && Math.abs(current.scrollOffset - nextMetrics.scrollOffset) < 0.25
        ? current
        : nextMetrics
    ));
  }, [orientation, scrollContainerRef]);

  const scheduleMeasure = useCallback(() => {
    if (measureFrameRef.current !== null) return;
    measureFrameRef.current = window.requestAnimationFrame(() => {
      measureFrameRef.current = null;
      measure();
    });
  }, [measure]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const track = trackRef.current;
    if (!container || !track) return;

    const resizeObserver = new ResizeObserver(scheduleMeasure);
    const observeContent = () => {
      resizeObserver.observe(container);
      resizeObserver.observe(track);
      Array.from(container.children).forEach((child) => resizeObserver.observe(child));
    };
    const mutationObserver = new MutationObserver(() => {
      observeContent();
      scheduleMeasure();
    });

    observeContent();
    mutationObserver.observe(container, { childList: true });
    const handleScroll = () => {
      scheduleMeasure();
      revealScrollbar();
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", scheduleMeasure);
    scheduleMeasure();

    return () => {
      dragRef.current = null;
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", scheduleMeasure);
      clearHideTimer();
      if (measureFrameRef.current !== null) {
        window.cancelAnimationFrame(measureFrameRef.current);
        measureFrameRef.current = null;
      }
    };
  }, [clearHideTimer, revealScrollbar, scheduleMeasure, scrollContainerRef]);

  const handleThumbPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const container = scrollContainerRef.current;
    const track = trackRef.current;
    if (!container || !track || !metrics.visible) return;

    const trackSize = orientation === "vertical" ? track.clientHeight : track.clientWidth;
    const clientSize = orientation === "vertical" ? container.clientHeight : container.clientWidth;
    const scrollSize = orientation === "vertical" ? container.scrollHeight : container.scrollWidth;
    const scrollOffset = orientation === "vertical" ? container.scrollTop : container.scrollLeft;
    const maxScrollOffset = Math.max(0, scrollSize - clientSize);
    const thumbSize = Math.min(
      trackSize,
      Math.max(customScrollbarMinThumbSize[orientation], (clientSize / scrollSize) * trackSize)
    );
    const maxThumbOffset = Math.max(0, trackSize - thumbSize);
    const startThumbOffset = maxScrollOffset > 0 ? (scrollOffset / maxScrollOffset) * maxThumbOffset : 0;

    dragRef.current = {
      pointerId: event.pointerId,
      startPointerCoordinate: orientation === "vertical" ? event.clientY : event.clientX,
      startThumbOffset,
      maxThumbOffset,
      maxScrollOffset
    };
    revealScrollbar(false);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }, [metrics.visible, orientation, revealScrollbar, scrollContainerRef]);

  const handleThumbPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const container = scrollContainerRef.current;
    if (!drag || !container || drag.pointerId !== event.pointerId) return;

    const pointerCoordinate = orientation === "vertical" ? event.clientY : event.clientX;
    const nextThumbOffset = Math.min(
      drag.maxThumbOffset,
      Math.max(0, drag.startThumbOffset + pointerCoordinate - drag.startPointerCoordinate)
    );
    const nextScrollOffset = drag.maxThumbOffset > 0
      ? (nextThumbOffset / drag.maxThumbOffset) * drag.maxScrollOffset
      : 0;
    if (orientation === "vertical") {
      container.scrollTop = nextScrollOffset;
    } else {
      container.scrollLeft = nextScrollOffset;
    }
    event.preventDefault();
  }, [orientation, scrollContainerRef]);

  const finishThumbDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!pointerOverRef.current) {
      scheduleHide();
    }
  }, [scheduleHide]);

  const handleTrackPointerEnter = useCallback(() => {
    pointerOverRef.current = true;
    revealScrollbar(false);
  }, [revealScrollbar]);

  const handleTrackPointerLeave = useCallback(() => {
    pointerOverRef.current = false;
    if (!dragRef.current) {
      scheduleHide();
    }
  }, [scheduleHide]);

  const handleLostPointerCapture = useCallback(() => {
    dragRef.current = null;
    if (!pointerOverRef.current) {
      scheduleHide();
    }
  }, [scheduleHide]);

  const handleTrackPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    const container = scrollContainerRef.current;
    const thumb = thumbRef.current;
    if (!container || !thumb || !metrics.visible) return;

    revealScrollbar();

    const thumbRect = thumb.getBoundingClientRect();
    const pointerCoordinate = orientation === "vertical" ? event.clientY : event.clientX;
    const thumbStart = orientation === "vertical" ? thumbRect.top : thumbRect.left;
    const thumbEnd = orientation === "vertical" ? thumbRect.bottom : thumbRect.right;
    const pageDirection = pointerCoordinate < thumbStart ? -1 : pointerCoordinate > thumbEnd ? 1 : 0;
    if (pageDirection !== 0) {
      container.scrollBy(orientation === "vertical"
        ? { top: pageDirection * container.clientHeight, behavior: "auto" }
        : { left: pageDirection * container.clientWidth, behavior: "auto" });
    }
    event.preventDefault();
    event.stopPropagation();
  }, [metrics.visible, orientation, revealScrollbar, scrollContainerRef]);

  const thumbStyle: CSSProperties = orientation === "vertical"
    ? { height: metrics.thumbSize, transform: `translateY(${metrics.thumbOffset}px)` }
    : { width: metrics.thumbSize, transform: `translateX(${metrics.thumbOffset}px)` };

  return (
    <div
      ref={trackRef}
      className={`cap-custom-scrollbar cap-custom-scrollbar-${orientation}${metrics.visible ? "" : " is-hidden"}${isActive ? " is-active" : ""}`}
      role="scrollbar"
      aria-orientation={orientation}
      aria-valuemin={0}
      aria-valuemax={Math.round(metrics.maxScrollOffset)}
      aria-valuenow={Math.round(metrics.scrollOffset)}
      onPointerDown={handleTrackPointerDown}
      onPointerEnter={handleTrackPointerEnter}
      onPointerLeave={handleTrackPointerLeave}
    >
      <div
        ref={thumbRef}
        className="cap-custom-scrollbar-thumb"
        style={thumbStyle}
        onPointerDown={handleThumbPointerDown}
        onPointerMove={handleThumbPointerMove}
        onPointerUp={finishThumbDrag}
        onPointerCancel={finishThumbDrag}
        onLostPointerCapture={handleLostPointerCapture}
      />
    </div>
  );
};

export default CustomScrollbar;
