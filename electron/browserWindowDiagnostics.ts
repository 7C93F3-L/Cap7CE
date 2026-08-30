import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import type { RuntimeDiagnostics } from "./runtimeDiagnostics";
import type { WindowPresentationMode } from "./windowPresentationPolicy";

export type BrowserWindowSurface = "main" | "preview" | "line" | "capsule" | "startup-hint";

interface DiagnosedBrowserWindowOptions {
  create: (options: BrowserWindowConstructorOptions) => BrowserWindow;
  diagnostics: Pick<RuntimeDiagnostics, "log">;
  options: BrowserWindowConstructorOptions;
  presentationMode: WindowPresentationMode;
  surface: BrowserWindowSurface;
}

export const createBrowserWindowWithDiagnostics = ({ create, diagnostics, options, presentationMode, surface }: DiagnosedBrowserWindowOptions): BrowserWindow => {
  try {
    return create(options);
  } catch (error) {
    try {
      diagnostics.log("error", "window.creation.failed", { surface, presentationMode, error });
    } catch {
      // Diagnostics must not replace the original native window creation error.
    }
    throw error;
  }
};
