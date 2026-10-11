import { useEffect, useRef, type RefObject } from "react";

// Listing may read one page ahead; thumbnails keep their separate zero-margin
// viewport observer. Re-arm after a page completes, including short viewports.
export function useComputerSearchScrollPaging(rootRef: RefObject<HTMLElement>, endRef: RefObject<HTMLElement>,
  enabled: boolean, cursor: string | null, loadMore: () => Promise<void>, completeDirectory = false, failed = false) {
  const retryAfter = useRef(0);
  useEffect(() => {
    const root = rootRef.current, end = endRef.current;
    if (!enabled || !cursor || !root || !end) return;
    if (failed) {
      const retry = () => {
        const nearEnd = root.scrollHeight - root.scrollTop - root.clientHeight < 300
          || (root.scrollWidth > root.clientWidth && root.scrollWidth - root.scrollLeft - root.clientWidth < 300);
        if (nearEnd && Date.now() >= retryAfter.current) {
          retryAfter.current = Date.now() + 1500;
          void loadMore();
        }
      };
      root.addEventListener("wheel", retry, { passive: true }); root.addEventListener("scroll", retry, { passive: true });
      return () => { root.removeEventListener("wheel", retry); root.removeEventListener("scroll", retry); };
    }
    if (completeDirectory) {
      const timer = window.setTimeout(() => void loadMore(), 16);
      return () => window.clearTimeout(timer);
    }
    let requested = false;
    const observer = new IntersectionObserver(entries => {
      if (!requested && entries.some(entry => entry.isIntersecting)) {
        requested = true;
        void loadMore();
      }
    }, { root, rootMargin: "0px 240px 240px 0px" });
    observer.observe(end);
    return () => observer.disconnect();
  }, [rootRef, endRef, enabled, cursor, loadMore, completeDirectory, failed]);
}
