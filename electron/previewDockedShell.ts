import type { BrowserWindow, Rectangle } from "electron";
import { installDockedShell } from "./dockedShellAutomation";

type DockedShellHandle = ReturnType<typeof installDockedShell>;

const previewCollapsibleStates = new Set(["preview"]);

export class PreviewDockedShell {
  private controller: DockedShellHandle | null = null;
  private enabled = false;
  private fixed = false;
  private sessionActive = false;

  attach({
    window,
    enabled,
    isSessionActive,
    isInteractionBlocked,
    isNativeSnapActive = () => false,
    hideLine,
    markProgrammaticMove,
    setCollapsedLayerActive
  }: {
    window: BrowserWindow;
    enabled: boolean;
    isSessionActive: () => boolean;
    isInteractionBlocked: () => boolean;
    isNativeSnapActive?: () => boolean;
    hideLine: () => void;
    markProgrammaticMove: () => void;
    setCollapsedLayerActive: (active: boolean) => void;
  }) {
    this.detach();
    this.enabled = enabled;
    this.controller = installDockedShell({
      window,
      collapsibleStates: previewCollapsibleStates,
      enabled: false,
      enableDebugShortcut: false,
      fixed: this.fixed,
      getShellContext: () => ({
        state: isSessionActive() ? "preview" : "inactive",
        maximized: window.isMaximized() || isNativeSnapActive(),
        interactionBlocked: isInteractionBlocked()
      }),
      hideLine,
      markProgrammaticMove,
      setCollapsedLayerActive
    });
  }

  detach() {
    this.controller?.dispose();
    this.controller = null;
    this.fixed = false;
    this.sessionActive = false;
  }

  resetSession() {
    this.controller?.reset(false);
    this.fixed = false;
    this.controller?.setFixed(false);
    this.sessionActive = false;
    this.controller?.setEnabled(false);
  }

  startSession() {
    this.sessionActive = true;
    this.controller?.setEnabled(this.enabled);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.controller?.setEnabled(this.sessionActive && enabled);
  }

  toggleFixed() {
    this.fixed = !this.fixed;
    this.controller?.setFixed(this.fixed);
    return this.fixed;
  }

  isFixed() {
    return this.fixed;
  }

  hasActiveSession() {
    return Boolean(this.controller?.hasActiveSession());
  }

  getExpandedBounds(window: BrowserWindow) {
    return this.controller?.getExpandedBounds() ?? window.getBounds();
  }

  reconcileDisplayConfiguration() {
    return this.controller?.reconcileDisplayConfiguration() ?? false;
  }

  applyExpandedBounds(window: BrowserWindow, bounds: Rectangle, markProgrammaticMove: () => void) {
    if (this.controller?.updateExpandedBounds(bounds)) return;
    markProgrammaticMove();
    window.setBounds(bounds, false);
  }
}

export const previewDockedShell = new PreviewDockedShell();
