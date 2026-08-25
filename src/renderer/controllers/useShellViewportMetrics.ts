import { useEffect, useState } from "react";

export const useShellViewportMetrics = () => {
  const [shellViewportHeight, setShellViewportHeight] = useState(() => window.innerHeight);
  const [miniStandardHeight, setMiniStandardHeight] = useState<number | null>(null);

  useEffect(() => {
    const syncShellViewportHeight = () => setShellViewportHeight(window.innerHeight);
    syncShellViewportHeight();
    window.addEventListener("resize", syncShellViewportHeight);

    const getShellLayoutMetrics = window.cap7ce?.window.getShellLayoutMetrics;
    if (getShellLayoutMetrics) {
      void getShellLayoutMetrics().then((metrics) => {
        if (Number.isFinite(metrics.miniStandardHeight)) {
          setMiniStandardHeight(metrics.miniStandardHeight);
        }
      });
    }

    return () => window.removeEventListener("resize", syncShellViewportHeight);
  }, []);

  return { shellViewportHeight, miniStandardHeight };
};
