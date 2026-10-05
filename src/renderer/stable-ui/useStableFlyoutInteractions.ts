import { useEffect, useRef, type RefObject } from "react";

export const useStableFlyoutInteractions = (element: RefObject<HTMLDivElement | null>, onClose: () => void) => {
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dismiss = () => close.current();
    const pointer = (event: PointerEvent) => { if (!element.current?.contains(event.target as Node)) dismiss(); };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopImmediatePropagation(); dismiss();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
    const opened = (event: Event) => { if ((event as CustomEvent).detail !== element.current) dismiss(); };
    const scroll = (event: Event) => { if (!element.current?.contains(event.target as Node)) dismiss(); };
    document.dispatchEvent(new CustomEvent("cap-stable-flyout-open", { detail: element.current }));
    document.addEventListener("cap-stable-flyout-open", opened);
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("keydown", key, true); window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("cap-stable-flyout-open", opened); document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("scroll", scroll, true); window.removeEventListener("keydown", key, true); window.removeEventListener("resize", dismiss);
    };
  }, [element]);
};
