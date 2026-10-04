import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface StableSidebarFlyoutProps { anchor: DOMRect; label: string; children: ReactNode; onClose: () => void; placement?: "right" | "below"; align?: "start" | "end"; width?: number; maximumHeight?: number; className?: string; }

const StableSidebarFlyout = ({ anchor, label, children, onClose, placement = "right", align = "end", width = 184, maximumHeight = 240, className = "" }: StableSidebarFlyoutProps) => {
  const flyoutRef = useRef<HTMLDivElement | null>(null);
  const resolvedMaximumHeight = Math.min(maximumHeight, window.innerHeight - 10);
  const belowLeft = align === "start" ? anchor.left : anchor.right - width;
  const left = placement === "below" ? Math.max(5, Math.min(belowLeft, window.innerWidth - width - 5)) : Math.max(5, Math.min(anchor.right + 5, window.innerWidth - width - 5));
  const top = placement === "below" ? Math.max(5, Math.min(anchor.bottom + 5, window.innerHeight - resolvedMaximumHeight - 5)) : Math.max(5, Math.min(anchor.top, window.innerHeight - resolvedMaximumHeight - 5)); const portalHost = document.querySelector<HTMLElement>(".cap-stable-ui") ?? document.body;
  const style: CSSProperties = { left, top, width, maxHeight: resolvedMaximumHeight };
  useEffect(() => {
    const closeOnPointerDown = (event: PointerEvent) => { if (!flyoutRef.current?.contains(event.target as Node)) onClose(); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOnPointerDown); window.removeEventListener("keydown", closeOnEscape); };
  }, [onClose]);
  return createPortal(
    <div ref={flyoutRef} className={`cap-stable-sidebar-flyout${className ? ` ${className}` : ""}`} role="dialog" aria-label={label} style={style} onClick={(event) => event.stopPropagation()}>{children}</div>,
    portalHost
  );
};

export default StableSidebarFlyout;
