import type { BrowserWindow } from "electron";
import {
  getWindowPresentationBrowserOptions,
  getWindowPresentationPolicy,
  resolveWindowPresentationTheme,
  type WindowPresentationMode,
  type WindowPresentationSurface
} from "./windowPresentationPolicy";

type ThemePreference = "system" | "light" | "dark";

export class WindowPresentationRuntime {
  private policy = getWindowPresentationPolicy();
  private themePreference: ThemePreference = "system";

  configure(mode: unknown, themePreference: ThemePreference) {
    this.policy = getWindowPresentationPolicy(mode);
    this.themePreference = themePreference;
  }

  get mode(): WindowPresentationMode {
    return this.policy.mode;
  }

  get layoutFileName() {
    return this.policy.layoutFileName;
  }

  get titlebarHeight() {
    return this.policy.titlebarHeight;
  }

  get usesSystemTheme() {
    return this.themePreference === "system";
  }

  getBrowserOptions(surface: WindowPresentationSurface, systemUsesDarkColors: boolean) {
    return getWindowPresentationBrowserOptions(
      this.policy,
      surface,
      resolveWindowPresentationTheme(this.themePreference, systemUsesDarkColors)
    );
  }

  applyMainWindowAppearance(window: BrowserWindow | null, themePreference: ThemePreference, systemUsesDarkColors: boolean) {
    return this.applyWindowAppearance("main", window, themePreference, systemUsesDarkColors);
  }

  applyPreviewWindowAppearance(window: BrowserWindow | null, themePreference: ThemePreference, systemUsesDarkColors: boolean) {
    return this.applyWindowAppearance("preview", window, themePreference, systemUsesDarkColors);
  }

  private applyWindowAppearance(surface: WindowPresentationSurface, window: BrowserWindow | null, themePreference: ThemePreference, systemUsesDarkColors: boolean) {
    this.themePreference = themePreference;
    if (!window || window.isDestroyed()) return false;
    const options = this.getBrowserOptions(surface, systemUsesDarkColors);
    window.setBackgroundColor(options.backgroundColor);
    if (options.titleBarOverlay) window.setTitleBarOverlay(options.titleBarOverlay);
    return true;
  }
}
