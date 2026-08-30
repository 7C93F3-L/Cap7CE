import { BrowserWindow, screen, type BrowserWindowConstructorOptions, type Display, type IpcMain, type Rectangle } from "electron";
import type { WindowPresentationMode } from "./windowPresentationPolicy";
import type { WindowDockEdge } from "./windowLayoutTypes";
export interface CapsulePresentation {
  query: string;
  placeholder: string; operationHintVisible: boolean;
  ariaLabel: string;
  theme: "light" | "dark";
  appearanceColors: { themeColor: string; accentColor: string };
}

export interface CapsuleTarget {
  display: Display;
  edge: "top" | "bottom";
}

interface CapsuleWindowControllerOptions {
  createWindow?: (options: BrowserWindowConstructorOptions) => BrowserWindow;
  devServerUrl?: string;
  devToolsEnabled: boolean;
  getAlwaysOnTop: () => boolean;
  getMainWindow: () => BrowserWindow | null;
  getMode: () => WindowPresentationMode;
  isCapsuleActive: () => boolean;
  isMainSender: (webContentsId: number) => boolean;
  isQuitting: () => boolean;
  lockWebContentsZoom: (webContents: Electron.WebContents) => void;
  markMainMove: () => void;
  markMainResize: () => void;
  onCancel: (clearQuery: boolean) => void;
  onDraftChange: (query: string) => void;
  onSubmit: (query: string) => void;
  preloadPath: string;
  registrar: IpcMain;
  rendererPath: string;
  resolveCap7CEBounds: (display: Display, edge: "top" | "bottom") => Rectangle;
  resolveCompatibilityBounds: (display: Display, edge: "top" | "bottom") => Rectangle;
}

const defaultPresentation: CapsulePresentation = {
  query: "",
  placeholder: "", operationHintVisible: false,
  ariaLabel: "Search",
  theme: "light",
  appearanceColors: { themeColor: "#7C93F3", accentColor: "#68C3C0" }
};

const isHexColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value);
const normalizeText = (value: unknown, maximumLength: number) => typeof value === "string" ? value.slice(0, maximumLength) : "";

export const getAnchoredCapsuleBounds = (
  requestedBounds: Rectangle,
  actualBounds: Rectangle,
  edge: "top" | "bottom"
): Rectangle => ({
  x: requestedBounds.x + Math.round((requestedBounds.width - actualBounds.width) / 2),
  y: edge === "top" ? requestedBounds.y : requestedBounds.y + requestedBounds.height - actualBounds.height,
  width: actualBounds.width,
  height: actualBounds.height
});

export class CapsuleWindowController {
  private capsuleWindow: BrowserWindow | null = null;
  private presentation = defaultPresentation;
  private pendingTarget: CapsuleTarget | null = null;
  private activeEdge: "top" | "bottom" = "bottom";
  private pendingShowBounds: Rectangle | null = null;
  private blurTimer: NodeJS.Timeout | null = null;
  private workAreaTimer: NodeJS.Timeout | null = null;
  private composing = false;
  private suppressBlurUntil = 0;

  constructor(private readonly options: CapsuleWindowControllerOptions) {
    this.registerIpc();
  }

  prepareTarget(linePlacement?: { bounds: Rectangle; edge: WindowDockEdge } | null) {
    const display = linePlacement
      ? screen.getDisplayMatching(linePlacement.bounds)
      : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    this.pendingTarget = { display, edge: linePlacement?.edge === "top" ? "top" : "bottom" };
  }

  clearPendingTarget() {
    this.pendingTarget = null;
  }

  takeTarget(): CapsuleTarget {
    const fallbackWindow = this.options.getMainWindow();
    const fallbackDisplay = fallbackWindow && !fallbackWindow.isDestroyed()
      ? screen.getDisplayMatching(fallbackWindow.getBounds())
      : screen.getPrimaryDisplay();
    const target = this.pendingTarget ?? { display: fallbackDisplay, edge: "bottom" as const };
    this.pendingTarget = null;
    this.activeEdge = target.edge;
    return target;
  }

  show(bounds: Rectangle) {
    if (this.options.getMode() !== "compatibility") return false;
    this.pendingShowBounds = { ...bounds };
    const targetWindow = this.ensureWindow();
    if (!targetWindow || targetWindow.isDestroyed()) return false;
    this.pendingShowBounds = this.applyAnchoredBounds(targetWindow, bounds);
    this.applyAlwaysOnTop();
    this.sendPresentation();
    if (targetWindow.webContents.isLoadingMainFrame()) return true;
    this.reveal(targetWindow);
    return true;
  }

  hide() {
    this.pendingShowBounds = null;
    this.composing = false;
    this.clearBlurTimer();
    const targetWindow = this.capsuleWindow;
    if (!targetWindow || targetWindow.isDestroyed() || !targetWindow.isVisible()) return false;
    this.suppressBlurUntil = Date.now() + 200;
    targetWindow.hide();
    return true;
  }

  destroy() {
    this.clearBlurTimer();
    if (this.workAreaTimer) clearTimeout(this.workAreaTimer);
    this.workAreaTimer = null;
    const targetWindow = this.capsuleWindow;
    this.capsuleWindow = null;
    if (!targetWindow || targetWindow.isDestroyed()) return false;
    targetWindow.destroy();
    return true;
  }

  isVisible() {
    return Boolean(this.capsuleWindow && !this.capsuleWindow.isDestroyed() && this.capsuleWindow.isVisible());
  }

  applyAlwaysOnTop() {
    const targetWindow = this.capsuleWindow;
    if (!targetWindow || targetWindow.isDestroyed()) return false;
    targetWindow.setAlwaysOnTop(this.options.getAlwaysOnTop(), "screen-saver");
    return targetWindow.isAlwaysOnTop();
  }

  updatePresentation(value: unknown) {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<CapsulePresentation>;
    if (
      (candidate.theme !== "light" && candidate.theme !== "dark")
      || !candidate.appearanceColors
      || !isHexColor(candidate.appearanceColors.themeColor)
      || !isHexColor(candidate.appearanceColors.accentColor)
    ) return false;
    this.presentation = {
      query: normalizeText(candidate.query, 4096),
      placeholder: normalizeText(candidate.placeholder, 512), operationHintVisible: candidate.operationHintVisible === true,
      ariaLabel: normalizeText(candidate.ariaLabel, 128) || "Search",
      theme: candidate.theme,
      appearanceColors: { ...candidate.appearanceColors }
    };
    this.sendPresentation();
    return true;
  }

  reconcileDisplayConfiguration(changedDisplayId: number | null) {
    if (!this.options.isCapsuleActive()) return;
    const targetWindow = this.options.getMode() === "compatibility" ? this.capsuleWindow : this.options.getMainWindow();
    if (!targetWindow || targetWindow.isDestroyed()) return;
    const display = screen.getDisplayMatching(targetWindow.getBounds());
    if (changedDisplayId !== null && display.id !== changedDisplayId) return;
    if (this.workAreaTimer) clearTimeout(this.workAreaTimer);
    this.workAreaTimer = setTimeout(() => {
      this.workAreaTimer = null;
      if (!this.options.isCapsuleActive() || targetWindow.isDestroyed()) return;
      const currentBounds = targetWindow.getBounds();
      const currentDisplay = screen.getDisplayMatching(currentBounds);
      const nextBounds = this.options.getMode() === "compatibility"
        ? this.options.resolveCompatibilityBounds(currentDisplay, this.activeEdge)
        : this.options.resolveCap7CEBounds(currentDisplay, this.activeEdge);
      if (currentBounds.x === nextBounds.x && currentBounds.y === nextBounds.y
        && currentBounds.width === nextBounds.width && currentBounds.height === nextBounds.height) return;
      if (this.options.getMode() !== "compatibility") {
        this.options.markMainMove();
        if (currentBounds.width !== nextBounds.width || currentBounds.height !== nextBounds.height) this.options.markMainResize();
      }
      this.applyAnchoredBounds(targetWindow, nextBounds);
    }, 120);
  }

  private ensureWindow() {
    if (this.capsuleWindow && !this.capsuleWindow.isDestroyed()) return this.capsuleWindow;
    const createdWindow = (this.options.createWindow ?? ((options) => new BrowserWindow(options)))({
      width: 300, height: 34, title: "Cap7CE Capsule", frame: false, transparent: true,
      backgroundColor: "#00000000", hasShadow: false, show: false, skipTaskbar: true,
      resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      paintWhenInitiallyHidden: true,
      webPreferences: { preload: this.options.preloadPath, contextIsolation: true, devTools: this.options.devToolsEnabled, nodeIntegration: false }
    });
    this.capsuleWindow = createdWindow;
    this.options.lockWebContentsZoom(createdWindow.webContents);
    createdWindow.setMenuBarVisibility(false);
    const loadPromise = this.options.devServerUrl
      ? this.loadDevelopmentRenderer(createdWindow, this.options.devServerUrl)
      : createdWindow.loadFile(this.options.rendererPath, { query: { window: "compatibility-capsule" } });
    void loadPromise.catch((error) => console.warn("[capsule] failed to load renderer", error));
    createdWindow.webContents.on("did-finish-load", () => {
      this.sendPresentation();
      if (this.pendingShowBounds) this.reveal(createdWindow);
    });
    createdWindow.on("focus", () => this.clearBlurTimer());
    createdWindow.on("blur", () => this.scheduleBlurCancellation());
    createdWindow.on("close", (event) => {
      if (this.options.isQuitting()) return;
      event.preventDefault();
      this.options.onCancel(false);
    });
    createdWindow.on("closed", () => {
      if (this.capsuleWindow === createdWindow) this.capsuleWindow = null;
    });
    return createdWindow;
  }

  private reveal(targetWindow: BrowserWindow) {
    if (!this.pendingShowBounds || targetWindow.isDestroyed()) return;
    this.pendingShowBounds = this.applyAnchoredBounds(targetWindow, this.pendingShowBounds);
    this.applyAlwaysOnTop();
    targetWindow.show();
    targetWindow.focus();
    targetWindow.moveTop();
  }

  private applyAnchoredBounds(targetWindow: BrowserWindow, requestedBounds: Rectangle) {
    targetWindow.setBounds(requestedBounds, false);
    const actualBounds = targetWindow.getBounds();
    const anchoredBounds = getAnchoredCapsuleBounds(requestedBounds, actualBounds, this.activeEdge);
    if (anchoredBounds.x !== actualBounds.x || anchoredBounds.y !== actualBounds.y) {
      targetWindow.setBounds(anchoredBounds, false);
    }
    return anchoredBounds;
  }

  private scheduleBlurCancellation() {
    this.clearBlurTimer();
    this.blurTimer = setTimeout(() => {
      this.blurTimer = null;
      const targetWindow = this.capsuleWindow;
      if (!targetWindow || targetWindow.isDestroyed() || !targetWindow.isVisible() || targetWindow.isFocused()) return;
      if (this.composing || Date.now() < this.suppressBlurUntil) {
        this.scheduleBlurCancellation();
        return;
      }
      this.options.onCancel(false);
    }, 120);
  }

  private clearBlurTimer() {
    if (this.blurTimer) clearTimeout(this.blurTimer);
    this.blurTimer = null;
  }

  private sendPresentation() {
    const targetWindow = this.capsuleWindow;
    if (!targetWindow || targetWindow.isDestroyed() || targetWindow.webContents.isLoadingMainFrame()) return;
    targetWindow.webContents.send("capsule:presentationChanged", this.presentation);
  }

  private ownsCapsuleSender(webContentsId: number) {
    return Boolean(this.capsuleWindow && !this.capsuleWindow.isDestroyed() && this.capsuleWindow.webContents.id === webContentsId);
  }

  private registerIpc() {
    this.options.registrar.handle("capsule:syncPresentation", (event, value: unknown) => (
      this.options.isMainSender(event.sender.id) && this.updatePresentation(value)
    ));
    this.options.registrar.handle("capsule:getPresentation", (event) => (
      this.ownsCapsuleSender(event.sender.id) ? this.presentation : null
    ));
    this.options.registrar.handle("capsule:updateDraft", (event, value: unknown) => {
      if (!this.ownsCapsuleSender(event.sender.id)) return false;
      this.options.onDraftChange(normalizeText(value, 4096));
      return true;
    });
    this.options.registrar.handle("capsule:submit", (event, value: unknown) => {
      if (!this.ownsCapsuleSender(event.sender.id)) return false;
      this.options.onSubmit(normalizeText(value, 4096));
      return true;
    });
    this.options.registrar.handle("capsule:cancel", (event, clearQuery: unknown) => {
      if (!this.ownsCapsuleSender(event.sender.id)) return false;
      this.options.onCancel(Boolean(clearQuery));
      return true;
    });
    this.options.registrar.handle("capsule:setComposing", (event, composing: unknown) => {
      if (!this.ownsCapsuleSender(event.sender.id)) return false;
      this.composing = Boolean(composing);
      if (!this.composing && this.capsuleWindow && !this.capsuleWindow.isFocused()) this.scheduleBlurCancellation();
      return true;
    });
  }

  private loadDevelopmentRenderer(targetWindow: BrowserWindow, devServerUrl: string) {
    const capsuleUrl = new URL(devServerUrl);
    capsuleUrl.searchParams.set("window", "compatibility-capsule");
    return targetWindow.loadURL(capsuleUrl.toString());
  }
}
