import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { AppearanceColors, ResolvedThemeMode } from "../shared/types";

const viewportMenuGap = 5;

type MenuPosition = { left: number; top: number };

const getTextColorForBackground = (color: string) => {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return "#191919";
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 160 ? "#191919" : "#ffffff";
};

export const getImageContextMenuStyle = (
  theme: ResolvedThemeMode,
  appearanceColors: AppearanceColors
): CSSProperties => ({
  "--theme-color": appearanceColors.themeColor,
  "--accent-color": appearanceColors.accentColor,
  "--theme-on-color": getTextColorForBackground(appearanceColors.themeColor),
  "--panel-bg": theme === "dark" ? "#212121" : "#fafafa",
  "--border-soft": theme === "dark" ? "#2a2a2a" : "#ececec",
  "--text-main": theme === "dark" ? "#b2b2b2" : "#111111"
} as CSSProperties);

export interface ImageContextMenuAction {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

export interface ImageContextMenuGroup {
  id: string;
  label: string;
  actions: ImageContextMenuAction[];
}

export interface ImageContextMenuHeader {
  format: string;
  fileName: string;
  details: string[];
}

export const truncateContextMenuFileName = (fileName: string, maximumLength = 28) => {
  if (fileName.length <= maximumLength) return fileName;
  const extensionIndex = fileName.lastIndexOf(".");
  const suffix = extensionIndex > 0 && fileName.length - extensionIndex <= 10
    ? fileName.slice(extensionIndex)
    : "";
  const stem = suffix ? fileName.slice(0, extensionIndex) : fileName;
  const remaining = Math.max(8, maximumLength - suffix.length - 1);
  const leadingLength = Math.ceil(remaining * 0.55);
  const trailingLength = Math.max(3, remaining - leadingLength);
  return `${stem.slice(0, leadingLength)}…${stem.slice(-trailingLength)}${suffix}`;
};

interface ImageContextMenuProps {
  x: number;
  y: number;
  theme: "light" | "dark";
  menuStyle?: CSSProperties;
  compact?: boolean;
  header: ImageContextMenuHeader;
  groups: ImageContextMenuGroup[];
}

const clampMenuPositionToViewport = (
  pointerX: number,
  pointerY: number,
  menuWidth: number,
  menuHeight: number
): MenuPosition => ({
  left: Math.min(Math.max(pointerX, viewportMenuGap), Math.max(viewportMenuGap, window.innerWidth - menuWidth - viewportMenuGap)),
  top: Math.min(Math.max(pointerY, viewportMenuGap), Math.max(viewportMenuGap, window.innerHeight - menuHeight - viewportMenuGap))
});

const ImageContextMenu = ({
  x,
  y,
  theme,
  menuStyle,
  compact = false,
  header,
  groups
}: ImageContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const groupButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [position, setPosition] = useState<(MenuPosition & { key: string }) | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [submenuPosition, setSubmenuPosition] = useState<(MenuPosition & { direction: "left" | "right"; key: string }) | null>(null);
  const measurementKey = `${x}:${y}:${compact}:${header.format}:${header.fileName}:${header.details.join(",")}:${groups.map((group) => `${group.id}:${group.label}:${group.actions.map((action) => `${action.id}:${action.label}`).join(",")}`).join("|")}`;
  const activeGroup = useMemo(
    () => groups.find((group) => group.id === activeGroupId) ?? null,
    [activeGroupId, groups]
  );

  useLayoutEffect(() => {
    if (!menuRef.current) {
      setPosition(null);
      return;
    }
    const bounds = menuRef.current.getBoundingClientRect();
    const nextPosition = clampMenuPositionToViewport(x, y, bounds.width, bounds.height);
    if (compact) {
      const submenuGap = 4;
      const pairWidth = bounds.width * 2 + submenuGap;
      const availableWidth = window.innerWidth - viewportMenuGap * 2;
      if (pairWidth <= availableWidth) {
        const rightOpeningMaximumLeft = window.innerWidth - viewportMenuGap - pairWidth;
        const leftOpeningMinimumLeft = viewportMenuGap + bounds.width + submenuGap;
        const maximumRootLeft = window.innerWidth - viewportMenuGap - bounds.width;
        const rightOpeningLeft = Math.min(Math.max(nextPosition.left, viewportMenuGap), rightOpeningMaximumLeft);
        const leftOpeningLeft = Math.min(Math.max(nextPosition.left, leftOpeningMinimumLeft), maximumRootLeft);
        const distanceToMenu = (left: number) => x < left
          ? left - x
          : x > left + bounds.width
            ? x - left - bounds.width
            : 0;
        const rightDistance = distanceToMenu(rightOpeningLeft);
        const leftDistance = distanceToMenu(leftOpeningLeft);
        nextPosition.left = rightDistance < leftDistance
          || (rightDistance === leftDistance && Math.abs(rightOpeningLeft - x) <= Math.abs(leftOpeningLeft - x))
          ? rightOpeningLeft
          : leftOpeningLeft;
      }
    }
    setPosition({
      ...nextPosition,
      key: measurementKey
    });
  }, [compact, measurementKey, x, y]);

  useEffect(() => {
    if (activeGroupId && !groups.some((group) => group.id === activeGroupId)) {
      setActiveGroupId(null);
    }
  }, [activeGroupId, groups]);

  useLayoutEffect(() => {
    const parentButton = activeGroupId ? groupButtonRefs.current.get(activeGroupId) : null;
    const submenu = submenuRef.current;
    if (!activeGroup || !parentButton || !submenu || position?.key !== measurementKey) {
      setSubmenuPosition(null);
      return;
    }
    const parentBounds = parentButton.getBoundingClientRect();
    const submenuBounds = submenu.getBoundingClientRect();
    const submenuGap = 4;
    const rightLeft = parentBounds.right + submenuGap;
    const leftLeft = parentBounds.left - submenuBounds.width - submenuGap;
    const canOpenRight = rightLeft + submenuBounds.width <= window.innerWidth - viewportMenuGap;
    const canOpenLeft = leftLeft >= viewportMenuGap;
    let direction: "left" | "right" = canOpenRight || !canOpenLeft ? "right" : "left";
    let preferredLeft = direction === "right" ? rightLeft : leftLeft;

    setSubmenuPosition({
      left: Math.min(Math.max(preferredLeft, viewportMenuGap), Math.max(viewportMenuGap, window.innerWidth - submenuBounds.width - viewportMenuGap)),
      top: Math.min(Math.max(parentBounds.top, viewportMenuGap), Math.max(viewportMenuGap, window.innerHeight - submenuBounds.height - viewportMenuGap)),
      direction,
      key: `${measurementKey}:${activeGroup.id}`
    });
  }, [activeGroup, activeGroupId, measurementKey, position]);

  const measuredPosition = position?.key === measurementKey ? position : null;
  const positionedStyle: CSSProperties = measuredPosition
    ? { left: measuredPosition.left, top: measuredPosition.top, visibility: "visible" }
    : { left: x, top: y, visibility: "hidden" };

  return createPortal(
    <div
      ref={menuRef}
      className={`context-menu context-menu-${theme} context-menu-grouped${compact ? " context-menu-mini" : ""}`}
      data-context-menu="true"
      style={{ ...menuStyle, ...positionedStyle }}
      role="menu"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && activeGroupId) {
          event.preventDefault();
          event.stopPropagation();
          const parentButton = groupButtonRefs.current.get(activeGroupId);
          setActiveGroupId(null);
          parentButton?.focus();
        }
      }}
    >
      <div className="cap7ce-menu-motion-surface">
        <div className="context-menu-file-header" aria-label={`${header.format} ${header.fileName}`}>
          <span className="context-menu-file-format">{header.format}</span>
          <span className="context-menu-file-name" title={header.fileName}>{header.fileName}</span>
          <div className="context-menu-file-details">
            {header.details.map((detail) => <span key={detail}>{detail}</span>)}
          </div>
        </div>
        {groups.map((group) => (
          <button
            ref={(element) => {
              if (element) groupButtonRefs.current.set(group.id, element);
              else groupButtonRefs.current.delete(group.id);
            }}
            className={activeGroupId === group.id ? "context-menu-parent-action is-active" : "context-menu-parent-action"}
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={activeGroupId === group.id}
            key={group.id}
            onPointerEnter={() => setActiveGroupId(group.id)}
            onFocus={() => setActiveGroupId(group.id)}
            onClick={() => setActiveGroupId(group.id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight") return;
              event.preventDefault();
              setActiveGroupId(group.id);
              window.requestAnimationFrame(() => submenuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
            }}
          >
            <span>{group.label}</span>
          </button>
        ))}
      </div>
      {activeGroup && (
        <div
          key={activeGroup.id}
          ref={submenuRef}
          className={`context-menu context-menu-${theme} context-submenu context-submenu-${submenuPosition?.direction ?? "right"}${compact ? " context-menu-mini" : ""}`}
          data-context-menu="true"
          style={{
            left: submenuPosition?.left ?? x,
            top: submenuPosition?.top ?? y,
            visibility: submenuPosition?.key === `${measurementKey}:${activeGroup.id}` ? "visible" : "hidden"
          }}
          role="menu"
          aria-label={activeGroup.label}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft") return;
            event.preventDefault();
            event.stopPropagation();
            groupButtonRefs.current.get(activeGroup.id)?.focus();
          }}
        >
          <div className="cap7ce-menu-motion-surface">
            {activeGroup.actions.map((action) => (
              <button
                type="button"
                role="menuitem"
                key={action.id}
                disabled={action.disabled}
                onClick={action.onSelect}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};

export default ImageContextMenu;
