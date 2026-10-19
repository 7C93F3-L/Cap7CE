import { useEffect, useState } from "react";

// UI visibility is independent of focused thumbnail-work admission.
export function useCatalogWindowVisibility() {
  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  useEffect(() => {
    let normal = true;
    const sync = () => setVisible(normal && document.visibilityState === "visible");
    const unsubscribe = window.cap7ce?.window?.onShellStateChanged?.(state => { normal = state === "normal"; sync(); });
    document.addEventListener("visibilitychange", sync); sync();
    return () => { unsubscribe?.(); document.removeEventListener("visibilitychange", sync); };
  }, []);
  return visible;
}
