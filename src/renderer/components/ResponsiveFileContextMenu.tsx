import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { MiddleEllipsisFileName } from "./MiddleEllipsisFileName";
import "./ResponsiveFileContextMenu.css";
import { stableSidebarFlyoutPosition } from "../stable-ui/stableSidebarFlyoutPosition";

const viewportGap = 5;
const stableTitlebarBottom = 45;
const compactHeightBreakpoint = 360;

export interface ResponsiveFileContextMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void;
}

interface ResponsiveFileContextMenuProps {
  x: number;
  y: number;
  theme: "light" | "dark";
  menuStyle: CSSProperties;
  format: string;
  fileName: string;
  detail: string;
  showInfo?: boolean;
  returnFocus?: HTMLElement;
  anchor?: DOMRect;
  actionGroups: [ResponsiveFileContextMenuItem[], ResponsiveFileContextMenuItem[]];
  onClose: () => void;
}

const ResponsiveFileContextMenu = ({ x, y, theme, menuStyle, format, fileName, detail, showInfo = true, returnFocus, anchor, actionGroups, onClose }: ResponsiveFileContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const actionRefs = useRef(new Map<string, HTMLButtonElement>());
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const compact = viewport.height < compactHeightBreakpoint;
  const actions = actionGroups.flat();

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    const left = Math.min(Math.max(x, viewportGap), Math.max(viewportGap, viewport.width - bounds.width - viewportGap));
    const maximumTop = Math.max(stableTitlebarBottom, viewport.height - bounds.height - viewportGap);
    setPosition(anchor ? stableSidebarFlyoutPosition(anchor, bounds.width, bounds.height, viewport.width, viewport.height)
      : { left, top: Math.min(Math.max(y, stableTitlebarBottom), maximumTop) });
    menu.focus({ preventScroll: true });
  }, [anchor, compact, detail, fileName, format, viewport, x, y]);

  useEffect(() => {
    const updateViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("resize", updateViewport);
    window.addEventListener("blur", onClose);
    document.addEventListener("pointerdown", closeOnPointerDown);
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("blur", onClose);
      document.removeEventListener("pointerdown", closeOnPointerDown);
    };
  }, [onClose]);

  const focusAction = (index: number, direction = 1) => {
    for (let attempt = 0; attempt < actions.length; attempt++) {
      const action = actions[(index + attempt * direction + actions.length) % actions.length];
      if (action && !action.disabled) { actionRefs.current.get(action.id)?.focus(); return; }
    }
  };

  return createPortal(
    <div
      ref={menuRef}
      className={`responsive-file-context-menu responsive-file-context-menu-${theme}${compact ? " is-compact" : ""}${showInfo ? "" : " is-actions-only"}`}
      data-context-menu="true"
      data-layout={compact ? "compact" : "standard"}
      style={{ ...menuStyle, left: position?.left ?? x, top: position?.top ?? y, visibility: position ? "visible" : "hidden" }}
      role="menu"
      tabIndex={-1}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); returnFocus?.focus({ preventScroll: true }); return; }
        if (!new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]).has(event.key)) return;
        event.preventDefault();
        const activeIndex = actions.findIndex((action) => actionRefs.current.get(action.id) === document.activeElement);
        if (activeIndex < 0) { focusAction(0); return; }
        if (!compact) { const direction = event.key === "ArrowUp" ? -1 : 1; focusAction((activeIndex + direction + actions.length) % actions.length, direction); return; }
        const row = activeIndex % 3;
        const column = Math.floor(activeIndex / 3);
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") focusAction(((column + 1) % 2) * 3 + Math.min(row, actionGroups[(column + 1) % 2].length - 1));
        else { const length = actionGroups[column].length; focusAction(column * 3 + ((row + (event.key === "ArrowUp" ? -1 : 1) + length) % length)); }
      }}
    >
      {showInfo && <div className="responsive-file-context-menu-info">
        <strong>{format}</strong>
        <MiddleEllipsisFileName fileName={fileName} className="responsive-file-context-menu-name" />
        <span className="responsive-file-context-menu-detail" title={detail}>{detail}</span>
      </div>}
      {actionGroups.map((group, groupIndex) => <div className="responsive-file-context-menu-actions" key={groupIndex}>
        {group.map((action) => <button
          ref={(element) => { if (element) actionRefs.current.set(action.id, element); else actionRefs.current.delete(action.id); }}
          type="button"
          role="menuitem"
          disabled={action.disabled}
          key={action.id}
          onClick={() => { onClose(); action.onSelect(); }}
        ><span>{action.label}</span>{action.shortcut && <kbd>{action.shortcut}</kbd>}</button>)}
      </div>)}
    </div>,
    document.body
  );
};

export default ResponsiveFileContextMenu;
