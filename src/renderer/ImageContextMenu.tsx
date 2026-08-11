import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { AppearanceColors, ResolvedThemeMode } from "../shared/types";

const viewportMenuGap = 5;
const inlineSubmenuGap = 8;

type MenuPosition = { left: number; top: number };
type PositionedMenu = MenuPosition & {
  expandedWidth: number;
  key: string;
};

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
  primaryDetail?: string;
  details: string[];
}

export const splitMiddleEllipsisFileName = (fileName: string) => {
  const extensionIndex = fileName.lastIndexOf(".");
  const suffix = extensionIndex > 0 && fileName.length - extensionIndex <= 10
    ? fileName.slice(extensionIndex)
    : "";
  const stem = suffix ? fileName.slice(0, extensionIndex) : fileName;
  if (stem.length <= 16) return { leading: fileName, trailing: "" };
  const trailingStemLength = Math.min(8, Math.max(4, Math.floor(stem.length * 0.25)));
  return {
    leading: stem.slice(0, -trailingStemLength),
    trailing: `${stem.slice(-trailingStemLength)}${suffix}`
  };
};

const getContextMenuDetailValue = (detail: string) => detail.replace(/^[^:：]+[:：]\s*/, "");

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
  const rootColumnRef = useRef<HTMLDivElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const groupButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [position, setPosition] = useState<PositionedMenu | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const measurementKey = `${x}:${y}:${compact}:${header.format}:${header.fileName}:${header.primaryDetail ?? ""}:${header.details.join(",")}:${groups.map((group) => `${group.id}:${group.label}:${group.actions.map((action) => `${action.id}:${action.label}`).join(",")}`).join("|")}`;
  const activeGroup = useMemo(
    () => groups.find((group) => group.id === activeGroupId) ?? null,
    [activeGroupId, groups]
  );
  const splitFileName = useMemo(() => splitMiddleEllipsisFileName(header.fileName), [header.fileName]);
  const headerTooltip = useMemo(() => [
    header.fileName,
    ...(header.primaryDetail ? [getContextMenuDetailValue(header.primaryDetail)] : []),
    ...header.details.map(getContextMenuDetailValue)
  ].join("\n"), [header.details, header.fileName, header.primaryDetail]);

  useLayoutEffect(() => {
    if (!menuRef.current || !rootColumnRef.current) {
      setPosition(null);
      return;
    }
    const bounds = menuRef.current.getBoundingClientRect();
    const rootColumnBounds = rootColumnRef.current.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(menuRef.current);
    const submenuWidth = Number.parseFloat(computedStyle.getPropertyValue("--context-menu-submenu-width"))
      || rootColumnBounds.width;
    const nextPosition = clampMenuPositionToViewport(x, y, bounds.width, bounds.height);
    const expansionSpan = submenuWidth + inlineSubmenuGap;
    const expandedWidth = bounds.width + expansionSpan;
    const maximumRootLeft = Math.max(viewportMenuGap, window.innerWidth - viewportMenuGap - expandedWidth);
    nextPosition.left = Math.min(Math.max(nextPosition.left, viewportMenuGap), maximumRootLeft);
    setPosition({
      ...nextPosition,
      expandedWidth,
      key: measurementKey
    });
  }, [measurementKey, x, y]);

  useEffect(() => {
    if (activeGroupId && !groups.some((group) => group.id === activeGroupId)) {
      setActiveGroupId(null);
    }
  }, [activeGroupId, groups]);

  const measuredPosition = position?.key === measurementKey ? position : null;
  const isExpanded = Boolean(activeGroup && measuredPosition);
  const positionedStyle: CSSProperties = measuredPosition
    ? {
      left: measuredPosition.left,
      top: measuredPosition.top,
      width: isExpanded ? measuredPosition.expandedWidth : undefined,
      visibility: "visible"
    }
    : { left: x, top: y, visibility: "hidden" };

  return createPortal(
    <div
      ref={menuRef}
      className={`context-menu context-menu-${theme} context-menu-grouped${compact ? " context-menu-mini" : ""}${isExpanded ? " is-expanded" : ""}`}
      data-context-menu="true"
      style={{ ...menuStyle, ...positionedStyle }}
      role="menu"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerLeave={() => setActiveGroupId(null)}
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
        <div className="context-menu-unified-layout">
          <div ref={rootColumnRef} className="context-menu-root-column">
            <div className="context-menu-file-header" aria-label={`${header.format} ${header.fileName}`} title={headerTooltip}>
              <div className="context-menu-file-heading">
                <span className="context-menu-file-format">{header.format}</span>
                {header.primaryDetail && (
                  <span className="context-menu-file-primary-detail">{getContextMenuDetailValue(header.primaryDetail)}</span>
                )}
              </div>
              <span className="context-menu-file-name" title={header.fileName}>
                <span className="context-menu-file-name-leading">{splitFileName.leading}</span>
                {splitFileName.trailing && <span className="context-menu-file-name-trailing">{splitFileName.trailing}</span>}
              </span>
              <div className="context-menu-file-details">
                {header.details.map((detail) => <span key={detail}>{getContextMenuDetailValue(detail)}</span>)}
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
              className="context-menu-inline-submenu"
              role="menu"
              aria-label={activeGroup.label}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft") return;
                event.preventDefault();
                event.stopPropagation();
                groupButtonRefs.current.get(activeGroup.id)?.focus();
              }}
            >
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
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ImageContextMenu;
