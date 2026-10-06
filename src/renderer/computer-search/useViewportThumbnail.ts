import { useEffect, useRef, useState, type RefObject } from "react";

export function useViewportThumbnail(taskId: string, authorizationId: string, foreground: boolean,
  scrollContainerRef: RefObject<HTMLElement | null>) {
  const visualRef = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false), [failed, setFailed] = useState(false);
  const [lease, setLease] = useState<{ taskId: string; authorizationId: string; id: string } | null>(null);
  const currentLease = useRef<string | null>(null);
  useEffect(() => {
    setVisible(false); setFailed(false);
    const target = visualRef.current;
    if (!foreground || !target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(records => {
      for (const record of records) if (record.target === target) {
        setVisible(record.isIntersecting);
        if (!record.isIntersecting) setFailed(false);
      }
    }, { root: scrollContainerRef.current, rootMargin: "0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [taskId, authorizationId, foreground, scrollContainerRef]);
  useEffect(() => {
    setLease(null);
    const api = window.cap7ce?.computerSearch;
    if (!taskId || !foreground || !visible || failed || !api?.acquireThumbnail) return;
    let disposed = false, acquired: string | null = null;
    const release = (id: string) => { void api.releaseThumbnail({ taskId, leaseId: id }).catch(() => undefined); };
    void api.acquireThumbnail({ taskId, authorizationId }).then(id => {
      if (!id) return;
      if (disposed) { release(id); return; }
      acquired = id; currentLease.current = id;
      setLease({ taskId, authorizationId, id });
    }, () => { /* Keep the format icon when no thumbnail interest can be granted. */ });
    return () => {
      disposed = true;
      if (currentLease.current === acquired) currentLease.current = null;
      if (acquired) release(acquired);
    };
  }, [taskId, authorizationId, foreground, visible, failed]);
  const url = foreground && visible && !failed && lease?.taskId === taskId && lease.authorizationId === authorizationId
    ? `cap7ce://computer-search-thumbnail/?task=${encodeURIComponent(taskId)}&authorization=${encodeURIComponent(authorizationId)}&lease=${encodeURIComponent(lease.id)}` : null;
  return { visualRef, url, fail: () => { if (lease && currentLease.current === lease.id) setFailed(true); } };
}
