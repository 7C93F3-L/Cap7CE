import { globalShortcut, screen, type BrowserWindow } from "electron";
import { isWindowDockEdgeExposed } from "./windowLayoutGeometry";
import type { WindowLayoutDisplaySnapshot } from "./windowLayoutTypes";
import { DockedShellController } from "./dockedShellController";

const debugShortcut = "CommandOrControl+Shift+F11";

export const installDockedShell = ({
  window,
  collapsibleStates,
  enabled,
  enableDebugShortcut,
  fixed,
  getShellContext,
  hideLine,
  markProgrammaticMove,
  markProgrammaticResize,
  setCollapsedLayerActive
}: {
  window: BrowserWindow;
  collapsibleStates?: ReadonlySet<string>;
  enabled: boolean;
  enableDebugShortcut: boolean;
  fixed?: boolean;
  getShellContext: () => { state: string; maximized: boolean; interactionBlocked: boolean };
  hideLine: () => void;
  markProgrammaticMove: () => void;
  markProgrammaticResize?: () => void;
  setCollapsedLayerActive?: (active: boolean) => void;
}) => {
  const controller = new DockedShellController({
    window,
    collapsibleStates,
    enabled,
    fixed,
    getCursorPoint: () => screen.getCursorScreenPoint(),
    getShellContext,
    hideLine,
    markProgrammaticMove,
    markProgrammaticResize,
    setCollapsedLayerActive,
    getDisplay: (bounds): WindowLayoutDisplaySnapshot => {
      const display = screen.getDisplayMatching(bounds);
      return { id: display.id, bounds: { ...display.bounds }, workArea: { ...display.workArea }, scaleFactor: display.scaleFactor };
    },
    isDockEdgeExposed: (display, edge, bounds) => isWindowDockEdgeExposed(
      bounds,
      display.bounds,
      screen.getAllDisplays().filter(({ id }) => id !== display.id).map(({ bounds: displayBounds }) => displayBounds),
      edge
    )
  });

  const shortcutRegistered = enableDebugShortcut && globalShortcut.register(debugShortcut, () => controller.toggle());
  const suppressWindowChange = () => controller.noteUserWindowInteraction();
  const resetHiddenWindow = () => controller.reset(false);
  window.on("will-move", suppressWindowChange);
  window.on("will-resize", suppressWindowChange);
  window.on("hide", resetHiddenWindow);
  controller.start();

  return {
    runSuppressed: <T>(action: () => T) => controller.runSuppressed(action),
    reset: (focus = false) => controller.reset(focus),
    restore: (focus = false) => controller.restore(focus),
    setEnabled: (nextEnabled: boolean) => controller.setEnabled(nextEnabled),
    setFixed: (nextFixed: boolean) => controller.setFixed(nextFixed),
    getState: () => controller.getState(),
    hasActiveSession: () => controller.hasActiveSession(),
    getExpandedBounds: () => controller.getExpandedBounds(),
    reconcileDisplayConfiguration: () => controller.reconcileDisplayConfiguration(),
    updateExpandedBounds: (bounds: WindowLayoutDisplaySnapshot["bounds"]) => controller.updateExpandedBounds(bounds),
    dispose: () => {
      controller.dispose();
      window.removeListener("will-move", suppressWindowChange);
      window.removeListener("will-resize", suppressWindowChange);
      window.removeListener("hide", resetHiddenWindow);
      if (shortcutRegistered) globalShortcut.unregister(debugShortcut);
    }
  };
};
