import { useEffect, useState } from "react";

export const useShellViewportMetrics = () => {
  const [shellViewportHeight, setShellViewportHeight] = useState(() => window.innerHeight);
  const [miniStandardHeight, setMiniStandardHeight] = useState<number | null>(null);
  const [titlebarHeight, setTitlebarHeight] = useState(0);

  useEffect(() => {
    let currentTitlebarHeight = 0;
    const syncShellViewportHeight = () => setShellViewportHeight(Math.max(1, window.innerHeight - currentTitlebarHeight));
    syncShellViewportHeight();
    window.addEventListener("resize", syncShellViewportHeight);

    const getShellLayoutMetrics = window.cap7ce?.window.getShellLayoutMetrics;
    if (getShellLayoutMetrics) {
      void getShellLayoutMetrics().then((metrics) => {
        if (Number.isFinite(metrics.miniStandardHeight)) {
          setMiniStandardHeight(metrics.miniStandardHeight);
        }
        if (Number.isFinite(metrics.titlebarHeight)) {
          currentTitlebarHeight = Math.max(0, metrics.titlebarHeight);
          setTitlebarHeight(currentTitlebarHeight);
          syncShellViewportHeight();
        }
      });
    }

    return () => window.removeEventListener("resize", syncShellViewportHeight);
  }, []);

  return { shellViewportHeight, miniStandardHeight, titlebarHeight };
};
