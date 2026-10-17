import "./StableSidebarFlyout.css";
import { createContext, useContext, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { useStableFlyoutInteractions } from "./useStableFlyoutInteractions";
import { createPortal } from "react-dom";
import { stableSidebarFlyoutPosition } from "./stableSidebarFlyoutPosition";

interface StableSidebarFlyoutProps { anchor: DOMRect; label: string; children: ReactNode; onClose: () => void; placement?: "right" | "below"; align?: "start" | "end"; width?: number; maximumHeight?: number; className?: string; closeOnScroll?: boolean; returnFocus?: HTMLElement; }
export const StableFlyoutBoundaryContext = createContext<RefObject<HTMLElement | null> | null>(null);

const StableSidebarFlyout = ({ anchor, label, children, onClose, placement = "right", align = "end", width = 184, maximumHeight = 240, className = "", closeOnScroll = true, returnFocus }: StableSidebarFlyoutProps) => {
  const flyoutRef = useRef<HTMLDivElement | null>(null);
  const boundary = useContext(StableFlyoutBoundaryContext);
  const boundaryBottom = placement === "below" ? boundary?.current?.getBoundingClientRect().bottom : undefined;
  const boundaryTop = boundaryBottom === undefined ? undefined : Math.max(45, boundaryBottom + 6);
  const resolvedWidth = Math.min(width, window.innerWidth - 10);
  const resolvedMaximumHeight = boundaryTop === undefined ? Math.max(30, Math.min(maximumHeight, window.innerHeight - 50)) : Math.max(0, Math.min(maximumHeight, window.innerHeight - boundaryTop - 5));
  const belowLeft = align === "start" ? anchor.left : anchor.right - resolvedWidth;
  const beside = stableSidebarFlyoutPosition(anchor, resolvedWidth, resolvedMaximumHeight, window.innerWidth, window.innerHeight);
  const left = placement === "below" ? Math.max(5, Math.min(belowLeft, window.innerWidth - resolvedWidth - 5)) : beside.left;
  const top = placement === "below" ? boundaryTop ?? Math.max(45, Math.min(anchor.bottom + 5, window.innerHeight - resolvedMaximumHeight - 5)) : beside.top; const portalHost = document.querySelector<HTMLElement>(".cap-stable-ui") ?? document.body;
  const style: CSSProperties = { left, top, width: resolvedWidth, maxHeight: resolvedMaximumHeight };
  useStableFlyoutInteractions(flyoutRef, onClose, closeOnScroll, returnFocus);
  return createPortal(
    <div ref={flyoutRef} className={`cap-stable-sidebar-flyout${className ? ` ${className}` : ""}`} role="dialog" aria-label={label} style={style} onClick={(event) => event.stopPropagation()}>{children}</div>,
    portalHost
  );
};

export default StableSidebarFlyout;
