import { useEffect } from "react";

interface CurrentPageRefreshShortcutOptions {
  refresh: () => Promise<boolean>;
  onRefreshed: () => void;
  onFailed: () => void;
}

export const useCurrentPageRefreshShortcut = ({
  refresh,
  onRefreshed,
  onFailed
}: CurrentPageRefreshShortcutOptions) => {
  useEffect(() => {
    const requestRefresh = () => {
      void refresh()
        .then((refreshed) => { if (refreshed) onRefreshed(); })
        .catch(onFailed);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "F5") return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) requestRefresh();
    };

    const unsubscribe = window.cap7ce?.window.onRefreshCurrentPageRequested(requestRefresh);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      unsubscribe?.();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onFailed, onRefreshed, refresh]);
};
