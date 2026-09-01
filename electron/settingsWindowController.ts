import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import { SETTINGS_WINDOW_MINIMUM_SIZE, SettingsWindowLayoutStore, createSettingsWindowLayoutProfile, resolveSettingsWindowInitialBounds } from "./settingsWindowLayout";
import type { WindowLayoutDisplaySnapshot } from "./windowLayoutTypes";
import type { WindowPresentationMode } from "./windowPresentationPolicy";
interface SettingsWindowControllerOptions {
  browserOptions: () => BrowserWindowConstructorOptions;
  createWindow: (options: BrowserWindowConstructorOptions) => BrowserWindow;
  devServerUrl?: string;
  devToolsEnabled: boolean;
  getDisplayMatching: (bounds: Electron.Rectangle) => WindowLayoutDisplaySnapshot;
  getDisplays: () => WindowLayoutDisplaySnapshot[];
  getPrimaryDisplay: () => WindowLayoutDisplaySnapshot;
  isQuitting: () => boolean;
  layoutStore: SettingsWindowLayoutStore;
  lockWebContentsZoom: (webContents: Electron.WebContents) => void;
  preloadPath: string;
  presentationMode: () => WindowPresentationMode;
  rendererPath: string;
}

export class SettingsWindowController {
  private settingsWindow: BrowserWindow | null = null;
  private initialized = false;
  private opening: Promise<boolean> | null = null;
  private layoutCaptureTimer: NodeJS.Timeout | null = null;

  constructor(private readonly options: SettingsWindowControllerOptions) {}

  async open(): Promise<boolean> {
    if (this.restoreExistingWindow()) return true;
    if (this.opening) return this.opening;
    this.opening = this.create().finally(() => { this.opening = null; });
    return this.opening;
  }

  async flush() {
    this.captureLayout();
    await this.options.layoutStore.flush();
  }

  destroy() {
    this.clearLayoutCapture();
    const targetWindow = this.settingsWindow;
    this.settingsWindow = null;
    if (!targetWindow || targetWindow.isDestroyed()) return false;
    targetWindow.destroy();
    return true;
  }

  refreshAppearance(apply: (window: BrowserWindow) => void) {
    if (!this.settingsWindow || this.settingsWindow.isDestroyed()) return false;
    apply(this.settingsWindow);
    return true;
  }

  send(channel: string, ...args: unknown[]) {
    if (!this.settingsWindow || this.settingsWindow.isDestroyed()) return false;
    this.settingsWindow.webContents.send(channel, ...args);
    return true;
  }

  private async create() {
    if (!this.initialized) {
      await this.options.layoutStore.load();
      this.initialized = true;
    }
    if (this.restoreExistingWindow()) return true;

    const bounds = resolveSettingsWindowInitialBounds(
      this.options.layoutStore.profile,
      this.options.getDisplays(),
      this.options.getPrimaryDisplay()
    );
    const createdWindow = this.options.createWindow({
      ...bounds,
      minWidth: SETTINGS_WINDOW_MINIMUM_SIZE.width,
      minHeight: SETTINGS_WINDOW_MINIMUM_SIZE.height,
      title: "Cap7CE Settings",
      skipTaskbar: false,
      ...this.options.browserOptions(),
      show: false,
      paintWhenInitiallyHidden: true,
      resizable: true,
      minimizable: true,
      maximizable: true,
      fullscreenable: false,
      webPreferences: {
        preload: this.options.preloadPath,
        contextIsolation: true,
        devTools: this.options.devToolsEnabled,
        nodeIntegration: false
      }
    });
    this.settingsWindow = createdWindow;
    this.options.lockWebContentsZoom(createdWindow.webContents);
    createdWindow.setMenuBarVisibility(false);
    createdWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    createdWindow.once("ready-to-show", () => {
      if (this.settingsWindow !== createdWindow || createdWindow.isDestroyed()) return;
      createdWindow.show();
      createdWindow.focus();
    });
    createdWindow.on("move", () => this.scheduleLayoutCapture());
    createdWindow.on("resize", () => this.scheduleLayoutCapture());
    createdWindow.on("close", (event) => {
      if (this.options.isQuitting()) return;
      event.preventDefault();
      this.captureLayout();
      void this.options.layoutStore.flush().catch((error) => console.warn("[settings-window] layout write failed", error));
      createdWindow.hide();
    });
    createdWindow.on("closed", () => {
      this.clearLayoutCapture();
      if (this.settingsWindow === createdWindow) this.settingsWindow = null;
    });

    const loadPromise = this.options.devServerUrl
      ? this.loadDevelopmentRenderer(createdWindow, this.options.devServerUrl)
      : createdWindow.loadFile(this.options.rendererPath, {
        query: { window: "settings", presentation: this.options.presentationMode() }
      });
    void loadPromise.catch((error) => console.warn("[settings-window] failed to load renderer", error));
    return true;
  }

  private restoreExistingWindow() {
    if (!this.settingsWindow || this.settingsWindow.isDestroyed()) return false;
    if (this.settingsWindow.isMinimized()) this.settingsWindow.restore();
    if (!this.settingsWindow.isVisible()) {
      this.settingsWindow.setBounds(resolveSettingsWindowInitialBounds(
        this.options.layoutStore.profile,
        this.options.getDisplays(),
        this.options.getPrimaryDisplay()
      ), false);
    }
    this.settingsWindow.show();
    this.settingsWindow.focus();
    return true;
  }

  private loadDevelopmentRenderer(targetWindow: BrowserWindow, devServerUrl: string) {
    const settingsUrl = new URL(devServerUrl);
    settingsUrl.searchParams.set("window", "settings");
    settingsUrl.searchParams.set("presentation", this.options.presentationMode());
    return targetWindow.loadURL(settingsUrl.toString());
  }

  private scheduleLayoutCapture() {
    this.clearLayoutCapture();
    this.layoutCaptureTimer = setTimeout(() => {
      this.layoutCaptureTimer = null;
      this.captureLayout();
    }, 200);
  }

  private clearLayoutCapture() {
    if (!this.layoutCaptureTimer) return;
    clearTimeout(this.layoutCaptureTimer);
    this.layoutCaptureTimer = null;
  }

  private captureLayout() {
    const targetWindow = this.settingsWindow;
    if (!targetWindow || targetWindow.isDestroyed() || targetWindow.isMinimized() || targetWindow.isMaximized()) return false;
    const bounds = targetWindow.getBounds();
    const display = this.options.getDisplayMatching(bounds);
    this.options.layoutStore.setProfile(createSettingsWindowLayoutProfile(bounds, display));
    return true;
  }
}
