import type { BrowserWindow } from "electron";
import type { WindowLayoutBounds } from "./windowLayoutTypes";
import { STABLE_TITLEBAR_HEIGHT, type WindowPresentationBrowserOptions, type WindowPresentationTheme } from "./windowPresentationPolicy";

export const STABLE_UI_TITLEBAR_HEIGHT = STABLE_TITLEBAR_HEIGHT;
export const STABLE_UI_DEFAULT_WORK_AREA_RATIO = 0.9;
export const STABLE_UI_MINIMUM_OUTER_SIZE = { width: 300, height: 170 } as const;

export const resolveStableUiDefaultWindowBounds = (workArea: WindowLayoutBounds): WindowLayoutBounds => {
  const width = Math.max(1, Math.round(workArea.width * STABLE_UI_DEFAULT_WORK_AREA_RATIO));
  const height = Math.max(1, Math.round(workArea.height * STABLE_UI_DEFAULT_WORK_AREA_RATIO));
  return {
    width,
    height,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2)
  };
};

export const resolveWindowLayoutMemoryEnabled = (configured: boolean, stableUiEnabled: boolean) => stableUiEnabled || configured;

export const resolveStableUiBrowserOptions = (
  options: WindowPresentationBrowserOptions,
  enabled: boolean
): WindowPresentationBrowserOptions => {
  if (!enabled) return options;
  const stableOptions: WindowPresentationBrowserOptions = {
    ...options,
    frame: true,
    transparent: false,
    backgroundColor: "#00000000",
    roundedCorners: true,
    titleBarStyle: "hidden",
    titleBarOverlay: options.titleBarOverlay ? { ...options.titleBarOverlay, height: STABLE_UI_TITLEBAR_HEIGHT } : undefined
  };
  delete stableOptions.backgroundMaterial;
  return stableOptions;
};

export const getStableUiSafeBackgroundColor = (theme: WindowPresentationTheme) => (
  theme === "dark" ? "#202020" : "#F3F3F3"
);

export const applyStableUiWindowMaterial = (
  window: BrowserWindow,
  enabled: boolean,
  theme: WindowPresentationTheme
): "unchanged" | "acrylic" | "solid" => {
  if (!enabled) return "unchanged";
  try {
    window.setBackgroundMaterial("acrylic");
    window.setBackgroundColor("#00000000");
    return "acrylic";
  } catch {
    try { window.setBackgroundMaterial("none"); } catch { /* Electron without background material support. */ }
    window.setBackgroundColor(getStableUiSafeBackgroundColor(theme));
    return "solid";
  }
};

export const isStableUiLegacySizeShortcut = (actionId: string) => (
  actionId === "activateMicro" || actionId === "activateMini"
);
