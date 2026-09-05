import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import type { RuntimeDiagnostics } from "./runtimeDiagnostics";

export type BrowserWindowSurface = "main" | "preview" | "settings" | "line" | "startup-hint";

interface DiagnosedBrowserWindowOptions {
  create: (options: BrowserWindowConstructorOptions) => BrowserWindow;
  diagnostics: Pick<RuntimeDiagnostics, "log">;
  options: BrowserWindowConstructorOptions;
  surface: BrowserWindowSurface;
}

export const createBrowserWindowWithDiagnostics = ({ create, diagnostics, options, surface }: DiagnosedBrowserWindowOptions): BrowserWindow => {
  try {
    return create(options);
  } catch (error) {
    try {
      diagnostics.log("error", "window.creation.failed", { surface, error });
    } catch {
      // Diagnostics must not replace the original native window creation error.
    }
    throw error;
  }
};
