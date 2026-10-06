import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { loadThumbnailImage } from "./viewportThumbnailImage";

export function useViewportThumbnail(taskId: string, authorizationId: string, foreground: boolean,
  scrollContainerRef: RefObject<HTMLElement | null>, sourceKey = JSON.stringify([taskId, authorizationId])) {
  const visualRef = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false), [failed, setFailed] = useState(false);
  const [image, setImage] = useState<{ key: string; pixels: HTMLCanvasElement } | null>(null);
  const currentImage = useRef<typeof image>(null);
  const clearImage = useCallback(() => {
    if (currentImage.current) currentImage.current.pixels.width = currentImage.current.pixels.height = 0;
    currentImage.current = null; setImage(null);
  }, []);
  useEffect(() => () => {
    if (currentImage.current) currentImage.current.pixels.width = currentImage.current.pixels.height = 0;
    currentImage.current = null;
  }, []);
  useEffect(() => {
    if (currentImage.current?.key !== sourceKey) clearImage();
    setFailed(false);
  }, [sourceKey, taskId, authorizationId, clearImage]);
  useEffect(() => { if (!visible) clearImage(); }, [visible, clearImage]);
  useEffect(() => {
    const target = visualRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(records => {
      for (const record of records) if (record.target === target) {
        setVisible(record.isIntersecting);
        if (!record.isIntersecting) setFailed(false);
      }
    }, { root: scrollContainerRef.current, rootMargin: "0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [scrollContainerRef]);
  useEffect(() => {
    const api = window.cap7ce?.computerSearch;
    if (!taskId || !foreground || !visible || failed || !api?.acquireThumbnail) return;
    let disposed = false, acquired: string | null = null;
    const abort = new AbortController();
    const release = (id: string) => { void api.releaseThumbnail({ taskId, leaseId: id }).catch(() => undefined); };
    void api.acquireThumbnail({ taskId, authorizationId }).then(async id => {
      if (!id) return;
      if (disposed) { release(id); return; }
      acquired = id;
      try {
        const pixels = await loadThumbnailImage(`cap7ce://computer-search-thumbnail/?task=${encodeURIComponent(taskId)}&authorization=${encodeURIComponent(authorizationId)}&lease=${encodeURIComponent(id)}`, abort.signal);
        if (disposed) { pixels.width = pixels.height = 0; return; }
        const previous = currentImage.current;
        currentImage.current = { key: sourceKey, pixels }; setImage(currentImage.current);
        if (previous) previous.pixels.width = previous.pixels.height = 0;
      } catch { if (!disposed) setFailed(true); }
    }, () => { /* Keep the format icon when no thumbnail interest can be granted. */ });
    return () => {
      disposed = true;
      abort.abort();
      if (acquired) release(acquired);
    };
  }, [taskId, authorizationId, foreground, visible, failed, sourceKey]);
  return { visualRef, image: visible && image?.key === sourceKey ? image.pixels : null };
}
