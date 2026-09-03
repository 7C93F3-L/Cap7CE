import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface StableSidebarFlyoutProps { anchor: DOMRect; label: string; children: ReactNode; onClose: () => void; }

const StableSidebarFlyout = ({ anchor, label, children, onClose }: StableSidebarFlyoutProps) => {
  const flyoutRef = useRef<HTMLDivElement | null>(null);
  const left = Math.max(5, Math.min(anchor.right + 5, window.innerWidth - 195));
  const top = Math.max(5, Math.min(anchor.top, window.innerHeight - 250)); const portalHost = document.querySelector<HTMLElement>(".cap-stable-ui") ?? document.body;
  useEffect(() => {
    const closeOnPointerDown = (event: PointerEvent) => { if (!flyoutRef.current?.contains(event.target as Node)) onClose(); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOnPointerDown); window.removeEventListener("keydown", closeOnEscape); };
  }, [onClose]);
  return createPortal(
    <div ref={flyoutRef} className="cap-stable-sidebar-flyout" role="dialog" aria-label={label} style={{ left, top }} onClick={(event) => event.stopPropagation()}>{children}</div>,
    portalHost
  );
};

export default StableSidebarFlyout;
