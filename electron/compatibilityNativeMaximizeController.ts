import type { BrowserWindow, Rectangle } from "electron";

export type CompatibilityRestoreState = "micro" | "mini";

export interface CompatibilityNativeMaximizeDependencies {
  isCompatibilityMode: () => boolean;
  getShellState: () => string;
  enterNormalMaximized: () => void;
  restoreShellState: (restore: { state: CompatibilityRestoreState; bounds: Rectangle }) => void;
}

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
