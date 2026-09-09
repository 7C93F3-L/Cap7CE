import { useEffect, useRef, useState } from "react";

const isDocumentVisible = () => document.visibilityState === "visible";
const isDocumentActive = () => isDocumentVisible() && document.hasFocus();

export const useContentViewActivity = (cancelSearch: () => void) => {
  const [activityConfirmed, setActivityConfirmed] = useState(false);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    let disposed = false;

    const syncContentActivity = () => {
      const active = isDocumentActive();
      const requestVersion = ++requestVersionRef.current;
      if (!active) {
        setActivityConfirmed(false);
        if (!isDocumentVisible()) cancelSearch();
        void window.cap7ce?.cache.setContentViewActive(false).catch(() => undefined);
        return;
      }

      void window.cap7ce?.cache.setContentViewActive(true).then((accepted) => {
        if (disposed || requestVersion !== requestVersionRef.current || !isDocumentActive()) return;
        setActivityConfirmed(accepted === true);
      }).catch(() => {
        if (!disposed && requestVersion === requestVersionRef.current) setActivityConfirmed(false);
      });
    };

    syncContentActivity();
    window.addEventListener("focus", syncContentActivity);
    window.addEventListener("blur", syncContentActivity);
    document.addEventListener("visibilitychange", syncContentActivity);
    return () => {
      disposed = true;
      requestVersionRef.current += 1;
      window.removeEventListener("focus", syncContentActivity);
      window.removeEventListener("blur", syncContentActivity);
      document.removeEventListener("visibilitychange", syncContentActivity);
    };
  }, [cancelSearch]);

  return activityConfirmed;
};
