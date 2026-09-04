import { useEffect, useRef } from "react";

export const useSearchIndexRefresh = (refresh: (force?: boolean) => void, delayMs = 200) => {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    let timer: number | null = null;
    const unsubscribe = window.cap7ce?.search.onIndexChanged(() => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        refreshRef.current(false);
      }, delayMs);
    });
    const unsubscribePreviewKeywords = window.cap7ce?.preview.onManualKeywordsUpdated(() => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        refreshRef.current(true);
      }, delayMs);
    });
    return () => {
      unsubscribe?.();
      unsubscribePreviewKeywords?.();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [delayMs]);
};
