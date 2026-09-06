import type { Input, WebContents } from "electron";

type PageZoomInput = Pick<Input, "alt" | "code" | "control" | "key" | "meta">;
type RefreshShortcutInput = Pick<Input, "alt" | "code" | "control" | "isAutoRepeat" | "key" | "meta" | "shift" | "type">;

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

export const isMainWindowRefreshShortcut = (input: RefreshShortcutInput) => (
  input.type === "keyDown"
  && !input.alt
  && !input.control
  && !input.meta
  && !input.shift
  && (input.key === "F5" || input.code === "F5")
);

export const installMainWindowInputPolicy = (
  webContents: WebContents,
  requestRefresh = () => webContents.send("window:refreshCurrentPageRequested")
) => {
  webContents.on("before-input-event", (event, input) => {
    if (!isMainWindowRefreshShortcut(input)) return;

    event.preventDefault();
    if (!input.isAutoRepeat) {
      requestRefresh();
    }
  });
};
