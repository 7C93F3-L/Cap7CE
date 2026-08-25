import type { Input, WebContents } from "electron";

type PageZoomInput = Pick<Input, "alt" | "code" | "control" | "key" | "meta">;

const pageZoomKeys = new Set(["-", "_", "=", "+", "0"]);
const pageZoomCodes = new Set([
  "Minus",
  "Equal",
  "Digit0",
  "NumpadSubtract",
  "NumpadAdd",
  "Numpad0"
]);

export const isPageZoomShortcut = (input: PageZoomInput) => (
  (input.control || input.meta)
  && !input.alt
  && (pageZoomKeys.has(input.key) || pageZoomCodes.has(input.code))
);

export const lockWebContentsZoom = (webContents: WebContents) => {
  const restoreDefaultZoom = () => {
    if (!webContents.isDestroyed()) {
      webContents.setZoomFactor(1);
    }
  };

  restoreDefaultZoom();

  webContents.on("before-input-event", (event, input) => {
    if (!isPageZoomShortcut(input)) {
      return;
    }
    event.preventDefault();
    restoreDefaultZoom();
  });
  webContents.on("zoom-changed", (event) => {
    event.preventDefault();
    restoreDefaultZoom();
  });
  webContents.on("did-finish-load", restoreDefaultZoom);
};
