import { useEffect, type RefObject } from "react";

// Listing may read one page ahead; thumbnails keep their separate zero-margin
// viewport observer. Re-arm after a page completes, including short viewports.
export function useComputerSearchScrollPaging(rootRef: RefObject<HTMLElement>, endRef: RefObject<HTMLElement>,
  enabled: boolean, cursor: string | null, loadMore: () => Promise<void>) {
  useEffect(() => {
    const root = rootRef.current, end = endRef.current;
    if (!enabled || !cursor || !root || !end) return;
    let requested = false;
    const observer = new IntersectionObserver(entries => {
      if (!requested && entries.some(entry => entry.isIntersecting)) {
        requested = true;
        void loadMore();
      }
    }, { root, rootMargin: "0px 240px 240px 0px" });
    observer.observe(end);
    return () => observer.disconnect();
  }, [rootRef, endRef, enabled, cursor, loadMore]);
}
