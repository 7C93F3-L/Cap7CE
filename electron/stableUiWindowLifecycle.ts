import type { BrowserWindow } from "electron";
import type { WindowLayoutBounds } from "./windowLayoutTypes";

export type WindowMaterial = "acrylic" | "mica";
export type StableWindowTheme = "light" | "dark";
export type StableWindowSurface = "main" | "preview" | "settings";
export interface StableWindowBrowserOptions {
  frame: boolean;
  transparent: boolean;
  backgroundColor: string;
  roundedCorners: true;
  titleBarStyle: "hidden";
  titleBarOverlay: { color: string; symbolColor: string; height: number };
}

export const STABLE_UI_TITLEBAR_HEIGHT = 40;
export const STABLE_UI_LAYOUT_FILE_NAME = "window-layout-stable-ui.json";
export const STABLE_UI_DEFAULT_WORK_AREA_RATIO = { width: 0.9, height: 0.82 } as const;
export const STABLE_UI_DEFAULT_MAXIMUM_OUTER_SIZE = { width: 1760, height: 1000 } as const;
export const STABLE_UI_MINIMUM_OUTER_SIZE = { width: 300, height: 210 } as const;

export const resolveStableUiDefaultWindowBounds = (workArea: WindowLayoutBounds, position?: Pick<WindowLayoutBounds, "x" | "y">): WindowLayoutBounds => {
  const width = Math.max(1, Math.min(
    workArea.width,
    Math.max(
      STABLE_UI_MINIMUM_OUTER_SIZE.width,
      Math.min(STABLE_UI_DEFAULT_MAXIMUM_OUTER_SIZE.width, Math.round(workArea.width * STABLE_UI_DEFAULT_WORK_AREA_RATIO.width))
    )
  ));
  const height = Math.max(1, Math.min(
    workArea.height,
    Math.max(
      STABLE_UI_MINIMUM_OUTER_SIZE.height,
      Math.min(STABLE_UI_DEFAULT_MAXIMUM_OUTER_SIZE.height, Math.round(workArea.height * STABLE_UI_DEFAULT_WORK_AREA_RATIO.height))
    )
  ));
  return {
    width,
    height,
    x: position ? Math.max(workArea.x, Math.min(position.x, workArea.x + workArea.width - width)) : workArea.x + Math.round((workArea.width - width) / 2),
    y: position ? Math.max(workArea.y, Math.min(position.y, workArea.y + workArea.height - height)) : workArea.y + Math.round((workArea.height - height) / 2)
  };
};

export const resolveStableWindowTheme = (preference: "system" | "light" | "dark", systemUsesDarkColors: boolean): StableWindowTheme => (
  preference === "system" ? (systemUsesDarkColors ? "dark" : "light") : preference
);

export const getStableWindowSymbolColor = (theme: StableWindowTheme) => (
  theme === "dark" ? "#D8D8D8" : "#242424"
);

export const getStableWindowBrowserOptions = (theme: StableWindowTheme): StableWindowBrowserOptions => ({
    frame: true,
    transparent: false,
    backgroundColor: "#00000000",
    roundedCorners: true,
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#00000000", symbolColor: getStableWindowSymbolColor(theme), height: STABLE_UI_TITLEBAR_HEIGHT }
});

export const getStableUiSafeBackgroundColor = (theme: StableWindowTheme) => (
  theme === "dark" ? "#202020" : "#F3F3F3"
);

export const applyStableUiWindowMaterial = (
  window: BrowserWindow,
  theme: StableWindowTheme,
  material: WindowMaterial = "acrylic"
): WindowMaterial | "solid" => {
  try {
    window.setBackgroundMaterial(material);
    window.setBackgroundColor("#00000000");
    return material;
  } catch {
    try { window.setBackgroundMaterial("none"); } catch { /* Electron without background material support. */ }
    window.setBackgroundColor(getStableUiSafeBackgroundColor(theme));
    return "solid";
  }
};
