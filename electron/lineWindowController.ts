import { BrowserWindow, screen, type Rectangle } from "electron";

interface LineWindowControllerOptions {
  devServerUrl?: string;
  getAlwaysOnTop: () => boolean;
  getBounds: (windowHeight?: number) => Rectangle;
  interactionHeight: number;
  isQuitting: () => boolean;
  lockWebContentsZoom: (webContents: Electron.WebContents) => void;
  preloadPath: string;
  rendererPath: string;
  shouldShow: () => boolean;
  width: number;
}

export class LineWindowController {
  private lineWindow: BrowserWindow | null = null;

  constructor(private readonly options: LineWindowControllerOptions) {}

  create() {
    if (this.lineWindow && !this.lineWindow.isDestroyed()) return false;
    const createdWindow = new BrowserWindow({
      ...this.options.getBounds(),
      minWidth: this.options.width,
      maxWidth: this.options.width,
      title: "Cap7CE Line",
      skipTaskbar: true,
      frame: false,
      transparent: true,
      hasShadow: false,
      show: false,
      resizable: false,
      movable: false,
      focusable: false,
      backgroundColor: "#00000000",
      paintWhenInitiallyHidden: true,
      webPreferences: {
        preload: this.options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    this.lineWindow = createdWindow;
    this.options.lockWebContentsZoom(createdWindow.webContents);
    createdWindow.setIgnoreMouseEvents(false);
    this.position();

    const loadPromise = this.options.devServerUrl
      ? this.loadDevelopmentRenderer(createdWindow, this.options.devServerUrl)
      : createdWindow.loadFile(this.options.rendererPath, { query: { window: "line" } });
    void loadPromise.then(() => {
      if (this.lineWindow === createdWindow && this.options.shouldShow()) this.show();
    }).catch((error) => {
      if (!createdWindow.isDestroyed()) console.warn("[line] failed to load renderer", error);
    });

    createdWindow.once("ready-to-show", () => {
      if (this.lineWindow !== createdWindow || createdWindow.isDestroyed()) return;
      this.position();
      if (this.options.shouldShow()) this.show();
    });
    createdWindow.on("close", (event) => {
      if (this.options.isQuitting()) return;
      event.preventDefault();
      createdWindow.hide();
    });
    createdWindow.on("closed", () => {
      if (this.lineWindow === createdWindow) this.lineWindow = null;
    });
    return true;
  }

  destroy() {
    const targetWindow = this.lineWindow;
    this.lineWindow = null;
    if (!targetWindow || targetWindow.isDestroyed()) return false;
    targetWindow.destroy();
    return true;
  }

  hide() {
    if (!this.lineWindow || this.lineWindow.isDestroyed() || !this.lineWindow.isVisible()) return false;
    this.lineWindow.hide();
    return true;
  }

  show() {
    if (!this.options.shouldShow()) {
      return false;
    }
    if (!this.lineWindow || this.lineWindow.isDestroyed()) {
      this.create();
      return false;
    }
    this.position();
    this.applyAlwaysOnTop();
    this.refreshAppearance();
    this.lineWindow.showInactive();
    return true;
  }

  refreshAppearance() {
    if (!this.lineWindow || this.lineWindow.isDestroyed() || this.lineWindow.webContents.isLoadingMainFrame()) return;
    this.lineWindow.webContents.send("line:refreshAppearance");
  }

  applyAlwaysOnTop() {
    if (!this.lineWindow || this.lineWindow.isDestroyed()) return;
    if (this.options.getAlwaysOnTop()) {
      this.lineWindow.setAlwaysOnTop(true, "screen-saver");
    } else {
      this.lineWindow.setAlwaysOnTop(false);
    }
  }

  position() {
    if (!this.lineWindow || this.lineWindow.isDestroyed()) return;
    const actualHeight = this.lineWindow.getBounds().height;
    this.lineWindow.setBounds(this.options.getBounds(actualHeight), false);
    this.syncShape();
  }

  isVisibleOnDisplay(displayId: number) {
    return Boolean(
      this.lineWindow
      && !this.lineWindow.isDestroyed()
      && this.lineWindow.isVisible()
      && screen.getDisplayMatching(this.lineWindow.getBounds()).id === displayId
    );
  }

  ownsWebContents(webContentsId: number) {
    return Boolean(
      this.lineWindow
      && !this.lineWindow.isDestroyed()
      && this.lineWindow.webContents.id === webContentsId
    );
  }

  private loadDevelopmentRenderer(targetWindow: BrowserWindow, devServerUrl: string) {
    const lineUrl = new URL(devServerUrl);
    lineUrl.searchParams.set("window", "line");
    return targetWindow.loadURL(lineUrl.toString());
  }

  private syncShape() {
    if (!this.lineWindow || this.lineWindow.isDestroyed()) return;
    const bounds = this.lineWindow.getBounds();
    const interactionHeight = Math.min(this.options.interactionHeight, bounds.height);
    this.lineWindow.setShape([{
      x: 0,
      y: bounds.height - interactionHeight,
      width: bounds.width,
      height: interactionHeight
    }]);
  }
}
