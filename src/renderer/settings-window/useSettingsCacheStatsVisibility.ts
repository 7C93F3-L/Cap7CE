import { useEffect } from "react";

export const useSettingsCacheStatsVisibility = (visible: boolean, refreshCaches: () => Promise<void>) => {
  useEffect(() => {
    if (!visible) return;
    const refreshCacheStats = () => { void refreshCaches(); };
    refreshCacheStats();
    window.addEventListener("focus", refreshCacheStats);
    return () => window.removeEventListener("focus", refreshCacheStats);
  }, [refreshCaches, visible]);
};
