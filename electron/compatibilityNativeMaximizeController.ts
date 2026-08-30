import type { BrowserWindow, Rectangle } from "electron";

export type CompatibilityRestoreState = "micro" | "mini";

export interface CompatibilityNativeMaximizeDependencies {
  isCompatibilityMode: () => boolean;
  getShellState: () => string;
  enterNormalMaximized: () => void;
  restoreShellState: (restore: { state: CompatibilityRestoreState; bounds: Rectangle }) => void;
}

const snapBoundaryTolerance = 3;
const nearlyEqual = (left: number, right: number) => Math.abs(left - right) <= snapBoundaryTolerance;

const matchesGridInterval = (
  position: number,
  length: number,
  origin: number,
  total: number,
  divisions: number
) => {
  for (let start = 0; start < divisions; start += 1) {
    for (let end = start + 1; end <= divisions; end += 1) {
      const expectedStart = origin + Math.round(total * start / divisions);
      const expectedEnd = origin + Math.round(total * end / divisions);
      if (nearlyEqual(position, expectedStart) && nearlyEqual(position + length, expectedEnd)) return true;
    }
  }
  return false;
};

export const isNativeSnapArrangement = (bounds: Rectangle, workArea: Rectangle) => {
  if (bounds.width <= 0 || bounds.height <= 0 || workArea.width <= 0 || workArea.height <= 0) return false;
  const fillsWorkArea = nearlyEqual(bounds.x, workArea.x)
    && nearlyEqual(bounds.y, workArea.y)
    && nearlyEqual(bounds.width, workArea.width)
    && nearlyEqual(bounds.height, workArea.height);
  if (fillsWorkArea) return false;
  const horizontalMatch = [2, 3, 4].some((divisions) => matchesGridInterval(bounds.x, bounds.width, workArea.x, workArea.width, divisions));
  const verticalMatch = [1, 2].some((divisions) => matchesGridInterval(bounds.y, bounds.height, workArea.y, workArea.height, divisions));
  return horizontalMatch && verticalMatch;
};

export class CompatibilityNativeMaximizeController {
  private restore: { state: CompatibilityRestoreState; bounds: Rectangle } | null = null;
  private window: BrowserWindow | null = null;

  constructor(private readonly dependencies: CompatibilityNativeMaximizeDependencies) {}

  attach(window: BrowserWindow) {
    this.detach();
    this.window = window;
    window.on("maximize", this.handleMaximize);
    window.on("unmaximize", this.handleRestore);
  }

  detach() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.removeListener("maximize", this.handleMaximize);
      this.window.removeListener("unmaximize", this.handleRestore);
    }
    this.window = null;
    this.restore = null;
  }

  cancelRestore() {
    this.restore = null;
  }

  private readonly handleMaximize = () => {
    const state = this.dependencies.getShellState();
    if (
      !this.dependencies.isCompatibilityMode()
      || !this.window
      || this.window.isDestroyed()
      || (state !== "micro" && state !== "mini")
    ) {
      return;
    }
    this.restore = { state, bounds: this.window.getNormalBounds() };
    this.dependencies.enterNormalMaximized();
  };

  private readonly handleRestore = () => {
    if (!this.dependencies.isCompatibilityMode() || !this.restore) return;
    const restore = this.restore;
    this.restore = null;
    this.dependencies.restoreShellState(restore);
  };
}
