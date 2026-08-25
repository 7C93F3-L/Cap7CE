import type { BrowserWindow } from "electron";

interface WindowLayerControllerOptions {
  applyLineLayer: () => void;
  getMainFixed: () => boolean;
  getMainWindow: () => BrowserWindow | null;
  getPreviewFixed: () => boolean;
  getPreviewWindow: () => BrowserWindow | null;
  isPreviewActive: () => boolean;
}

export class WindowLayerController {
  private mainCollapsedLayerActive = false;
  private previewCollapsedLayerActive = false;

  constructor(private readonly options: WindowLayerControllerOptions) {}

  setMainCollapsedLayerActive(active: boolean) {
    this.mainCollapsedLayerActive = active;
    return this.apply();
  }

  setPreviewCollapsedLayerActive(active: boolean) {
    this.previewCollapsedLayerActive = active;
    return this.apply();
  }

  apply() {
    const mainWindow = this.options.getMainWindow();
    const previewWindow = this.options.getPreviewWindow();
    const previewIsActive = Boolean(
      this.options.isPreviewActive()
      && previewWindow
      && !previewWindow.isDestroyed()
      && previewWindow.isVisible()
    );

    if (mainWindow && !mainWindow.isDestroyed() && !previewIsActive) {
      this.applyWindowLayer(mainWindow, this.options.getMainFixed(), this.mainCollapsedLayerActive, true);
    }
    if (previewIsActive && previewWindow && !previewWindow.isDestroyed()) {
      this.applyWindowLayer(previewWindow, this.options.getPreviewFixed(), this.previewCollapsedLayerActive, false);
    }

    this.options.applyLineLayer();
    return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isAlwaysOnTop());
  }

  private applyWindowLayer(window: BrowserWindow, fixed: boolean, collapsed: boolean, focusWhenFixed: boolean) {
    if (fixed) {
      window.setAlwaysOnTop(true, "screen-saver");
      if (window.isVisible() && !window.isMinimized()) {
        window.moveTop();
        if (focusWhenFixed) window.focus();
      }
      return;
    }
    if (collapsed) {
      window.setAlwaysOnTop(true, "floating");
      if (window.isVisible() && !window.isMinimized()) window.moveTop();
      return;
    }
    window.setAlwaysOnTop(false);
  }
}
