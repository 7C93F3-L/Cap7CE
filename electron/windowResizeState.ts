import type { WindowLayoutBounds } from "./windowLayoutTypes";

export type ResizableShellWindowState = "micro" | "mini" | "normal";
export type ResizeSourceShellWindowState = ResizableShellWindowState | "settings";

export interface WindowResizeThresholds {
  microToMiniHeight: number;
  miniToMicroHeight: number;
  miniToNormalWidth: number;
  normalToMiniWidth: number;
  normalToMiniHeight: number;
}

export const DEFAULT_WINDOW_RESIZE_THRESHOLDS: WindowResizeThresholds = {
  microToMiniHeight: 300,
  miniToMicroHeight: 280,
  miniToNormalWidth: 520,
  normalToMiniWidth: 950,
  normalToMiniHeight: 640
};

export const resolveResizeTargetState = (
  currentState: ResizeSourceShellWindowState,
  bounds: WindowLayoutBounds,
  workArea?: WindowLayoutBounds,
  thresholds: WindowResizeThresholds = DEFAULT_WINDOW_RESIZE_THRESHOLDS
): ResizableShellWindowState => {
  if (currentState === "micro") {
    return bounds.height >= thresholds.microToMiniHeight ? "mini" : "micro";
  }

  if (currentState === "mini") {
    if (bounds.height <= thresholds.miniToMicroHeight) return "micro";
    return bounds.width > thresholds.miniToNormalWidth ? "normal" : "mini";
  }

  const normalMinimumWidth = Math.min(thresholds.normalToMiniWidth, workArea?.width ?? thresholds.normalToMiniWidth);
  const normalMinimumHeight = Math.min(thresholds.normalToMiniHeight, workArea?.height ?? thresholds.normalToMiniHeight);
  const shouldLeaveNormal = bounds.width < normalMinimumWidth
    || bounds.height < normalMinimumHeight;
  if (!shouldLeaveNormal) return "normal";
  return bounds.height <= thresholds.miniToMicroHeight ? "micro" : "mini";
};

export const isStableResizeBounds = (
  state: ResizeSourceShellWindowState,
  bounds: WindowLayoutBounds,
  workArea?: WindowLayoutBounds
) => resolveResizeTargetState(state, bounds, workArea) === (state === "settings" ? "normal" : state);
