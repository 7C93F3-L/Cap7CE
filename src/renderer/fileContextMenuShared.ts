import type { CSSProperties } from "react";
import type { AppearanceColors, ResolvedThemeMode } from "../shared/types";

const getTextColorForBackground = (color: string) => {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return "#191919";
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 160 ? "#191919" : "#ffffff";
};

export const getFileContextMenuStyle = (
  theme: ResolvedThemeMode,
  appearanceColors: AppearanceColors
): CSSProperties => ({
  "--theme-color": appearanceColors.themeColor,
  "--accent-color": appearanceColors.accentColor,
  "--theme-on-color": getTextColorForBackground(appearanceColors.themeColor),
  "--panel-bg": theme === "dark" ? "#212121" : "#fafafa",
  "--border-soft": theme === "dark" ? "#2a2a2a" : "#ececec",
  "--text-main": theme === "dark" ? "#b2b2b2" : "#111111",
  "--window-control-color": theme === "dark" ? "#4f4f4f" : "#9b9b9b",
  "--context-menu-control-hover": theme === "dark" ? "rgb(255 255 255 / 14%)" : "rgb(31 31 31 / 12%)",
  "--context-menu-control-pressed": theme === "dark" ? "rgb(255 255 255 / 20%)" : "rgb(31 31 31 / 17%)",
  "--cap-stable-control-transition": "background 180ms ease, color 180ms ease",
  "--cap-stable-flyout-enter": "cap7ce-context-menu-enter 180ms cubic-bezier(0.22, 0.85, 0.18, 1) both"
} as CSSProperties);

export interface FileContextMenuAction {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  shortcut?: string;
}

export interface FileContextMenuGroup {
  id: string;
  label: string;
  actions: FileContextMenuAction[];
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

export const getContextMenuParentPath = (filePath: string) => {
  const trimmedPath = filePath.replace(/[\\/]+$/, "");
  if (/^[a-zA-Z]:$/.test(trimmedPath)) return `${trimmedPath}\\`;
  const separatorIndex = Math.max(trimmedPath.lastIndexOf("\\"), trimmedPath.lastIndexOf("/"));
  if (separatorIndex < 0) return filePath;
  if (separatorIndex === 2 && /^[a-zA-Z]:/.test(trimmedPath)) return trimmedPath.slice(0, 3);
  return trimmedPath.slice(0, separatorIndex) || filePath;
};
