import type { BrowserWindow, Rectangle } from "electron";

export const applyEdgeCollapseWindowMode = ({
  enabled,
  getRestoredBounds,
  isNativeSnapActive,
  markProgrammaticMove,
  window
}: {
  enabled: boolean;
  getRestoredBounds: () => Rectangle;
  isNativeSnapActive: () => boolean;
  markProgrammaticMove: () => void;
  window: BrowserWindow | null;
}) => {
  if (!window || window.isDestroyed()) return false;
  if (!enabled) {
    window.setMaximizable(true);
    return true;
  }

  const nativeSnapActive = isNativeSnapActive();
  if (window.isMaximized()) window.unmaximize();
  if (nativeSnapActive && !window.isMinimized()) {
    markProgrammaticMove();
    window.setBounds(getRestoredBounds(), false);
  }
  window.setMaximizable(false);
  return true;
};
