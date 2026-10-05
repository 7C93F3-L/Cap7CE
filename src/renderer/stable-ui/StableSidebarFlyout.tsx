import { useRef, type CSSProperties, type ReactNode } from "react";
import { useStableFlyoutInteractions } from "./useStableFlyoutInteractions";
import { createPortal } from "react-dom";

interface StableSidebarFlyoutProps { anchor: DOMRect; label: string; children: ReactNode; onClose: () => void; placement?: "right" | "below"; align?: "start" | "end"; width?: number; maximumHeight?: number; className?: string; }

const StableSidebarFlyout = ({ anchor, label, children, onClose, placement = "right", align = "end", width = 184, maximumHeight = 240, className = "" }: StableSidebarFlyoutProps) => {
  const flyoutRef = useRef<HTMLDivElement | null>(null);
  const resolvedWidth = Math.min(width, window.innerWidth - 10);
  const resolvedMaximumHeight = Math.max(30, Math.min(maximumHeight, window.innerHeight - 50));
  const belowLeft = align === "start" ? anchor.left : anchor.right - resolvedWidth;
  const left = placement === "below" ? Math.max(5, Math.min(belowLeft, window.innerWidth - resolvedWidth - 5)) : Math.max(5, Math.min(anchor.right + 5, window.innerWidth - resolvedWidth - 5));
  const top = placement === "below" ? Math.max(45, Math.min(anchor.bottom + 5, window.innerHeight - resolvedMaximumHeight - 5)) : Math.max(45, Math.min(anchor.top, window.innerHeight - resolvedMaximumHeight - 5)); const portalHost = document.querySelector<HTMLElement>(".cap-stable-ui") ?? document.body;
  const style: CSSProperties = { left, top, width: resolvedWidth, maxHeight: resolvedMaximumHeight };
  useStableFlyoutInteractions(flyoutRef, onClose);
  return createPortal(
    <div ref={flyoutRef} className={`cap-stable-sidebar-flyout${className ? ` ${className}` : ""}`} role="dialog" aria-label={label} style={style} onClick={(event) => event.stopPropagation()}>{children}</div>,
    portalHost
  );
};

export default StableSidebarFlyout;
