import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { AppearanceColors, ResolvedThemeMode } from "../shared/types";
import { t } from "../../electron/localization";

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

interface ImageContextMenuProps {
  x: number;
  y: number;
  theme: "light" | "dark";
  menuStyle?: CSSProperties;
  compact?: boolean;
  primaryActionLabel: string;
  openActionLabel?: string;
  showInFolderActionLabel?: string;
  deleteActionLabel?: string;
  showEditKeywords?: boolean;
  showDelete?: boolean;
  onPrimaryAction: () => void;
  onOpen: () => void;
  onShowInFolder: () => void;
  onEditKeywords: () => void;
  onDeleteFile: () => void;
}

const clampMenuPositionToViewport = (
  pointerX: number,
  pointerY: number,
  menuWidth: number,
  menuHeight: number
): MenuPosition => ({
  left: Math.min(Math.max(pointerX, viewportMenuGap), window.innerWidth - menuWidth - viewportMenuGap),
  top: Math.min(Math.max(pointerY, viewportMenuGap), window.innerHeight - menuHeight - viewportMenuGap)
});

const ImageContextMenu = ({
  x,
  y,
  theme,
  menuStyle,
  compact = false,
  primaryActionLabel,
  openActionLabel = t("context.open"),
  showInFolderActionLabel = t("context.showInFolder"),
  deleteActionLabel = t("context.deleteFile"),
  showEditKeywords = true,
  showDelete = true,
  onPrimaryAction,
  onOpen,
  onShowInFolder,
  onEditKeywords,
  onDeleteFile
}: ImageContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<(MenuPosition & { key: string }) | null>(null);
  const measurementKey = `${x}:${y}:${primaryActionLabel}:${deleteActionLabel}:${showEditKeywords}`;

  useLayoutEffect(() => {
    if (!menuRef.current) {
      setPosition(null);
      return;
    }
    const bounds = menuRef.current.getBoundingClientRect();
    setPosition({
      ...clampMenuPositionToViewport(x, y, bounds.width, bounds.height),
      key: measurementKey
    });
  }, [measurementKey, x, y]);

  const measuredPosition = position?.key === measurementKey ? position : null;
  const positionedStyle: CSSProperties = measuredPosition
    ? { left: measuredPosition.left, top: measuredPosition.top, visibility: "visible" }
    : { left: x, top: y, visibility: "hidden" };

  return createPortal(
    <div
      ref={menuRef}
      className={`context-menu context-menu-${theme}${compact ? " context-menu-mini" : ""}`}
      data-context-menu="true"
      style={{ ...menuStyle, ...positionedStyle }}
      role="menu"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="cap7ce-menu-motion-surface">
        <button type="button" onClick={onPrimaryAction}>{primaryActionLabel}</button>
        <button type="button" onClick={onOpen}>{openActionLabel}</button>
        <button type="button" onClick={onShowInFolder}>{showInFolderActionLabel}</button>
        {showEditKeywords && <button type="button" onClick={onEditKeywords}>{t("context.editKeywords")}</button>}
        {showDelete && <button type="button" onClick={onDeleteFile}>{deleteActionLabel}</button>}
      </div>
    </div>,
    document.body
  );
};

export default ImageContextMenu;
