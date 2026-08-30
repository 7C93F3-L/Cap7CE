import { BrowserWindow, screen, type BrowserWindowConstructorOptions, type Rectangle } from "electron";
import { getDirectionalLineShape } from "./windowLayoutGeometry";
import type { WindowDockEdge } from "./windowLayoutTypes";
interface LineWindowPlacement { bounds: Rectangle; edge: WindowDockEdge }
interface LineWindowControllerOptions {
  createWindow?: (options: BrowserWindowConstructorOptions) => BrowserWindow;
  devServerUrl?: string;
  devToolsEnabled: boolean;
  getAlwaysOnTop: () => boolean;
  getPlacement: (currentBounds?: Rectangle, currentEdge?: WindowDockEdge) => LineWindowPlacement;
  interactionThickness: number;
  isQuitting: () => boolean;
  lockWebContentsZoom: (webContents: Electron.WebContents) => void;
  preloadPath: string;
  rendererPath: string;
  shouldShow: () => boolean;
}
export class LineWindowController {
  private lineWindow: BrowserWindow | null = null;
  private edge: WindowDockEdge = "bottom";
  constructor(private readonly options: LineWindowControllerOptions) {}

  create() {
    if (this.lineWindow && !this.lineWindow.isDestroyed()) return false;
    const placement = this.options.getPlacement();
    this.edge = placement.edge;
    const createdWindow = (this.options.createWindow ?? ((options) => new BrowserWindow(options)))({
      ...placement.bounds,
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
        contextIsolation: true, devTools: this.options.devToolsEnabled, nodeIntegration: false
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
    let placement = this.options.getPlacement(this.lineWindow.getBounds(), this.edge);
    this.edge = placement.edge;
    this.lineWindow.setBounds(placement.bounds, false);
    placement = this.options.getPlacement(this.lineWindow.getBounds(), this.edge);
    this.edge = placement.edge;
    this.lineWindow.setBounds(placement.bounds, false);
    this.syncPresentation();
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

  private syncPresentation() {
    if (!this.lineWindow || this.lineWindow.isDestroyed()) return;
    const bounds = this.lineWindow.getBounds();
    this.lineWindow.setShape([getDirectionalLineShape(bounds, this.edge, this.options.interactionThickness)]);
    if (!this.lineWindow.webContents.isLoadingMainFrame()) {
      this.lineWindow.webContents.send("line:placementChanged", this.edge);
    }
  }
}
