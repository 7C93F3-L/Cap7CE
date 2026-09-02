import type { BrowserWindow } from "electron";
import { applyStableUiWindowMaterial, resolveStableUiBrowserOptions, STABLE_UI_TITLEBAR_HEIGHT } from "./stableUiWindowLifecycle";
import { isCurrentStableUiDevelopmentEnabled } from "./stableUiDevelopmentContract";
import {
  getWindowPresentationBrowserOptions,
  getWindowPresentationPolicy,
  resolveWindowPresentationTheme,
  type WindowPresentationMode,
  type WindowPresentationSurface
} from "./windowPresentationPolicy";
export { applyCurrentStableUiAlwaysOnTopPreference, applyCurrentStableUiDevelopmentQuery, getStableUiDevelopmentLayoutFileName, isCurrentStableUiDevelopmentEnabled } from "./stableUiDevelopmentContract";
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
    return isCurrentStableUiDevelopmentEnabled(this.policy.mode) ? STABLE_UI_TITLEBAR_HEIGHT : this.policy.titlebarHeight;
  }

  get usesSystemTheme() {
    return this.themePreference === "system";
  }

  getBrowserOptions(surface: WindowPresentationSurface, systemUsesDarkColors: boolean) {
    return resolveStableUiBrowserOptions(getWindowPresentationBrowserOptions(
      this.policy,
      surface,
      resolveWindowPresentationTheme(this.themePreference, systemUsesDarkColors)
    ), isCurrentStableUiDevelopmentEnabled(this.policy.mode));
  }

  applyMainWindowAppearance(window: BrowserWindow | null, themePreference: ThemePreference, systemUsesDarkColors: boolean) {
    return this.applyWindowAppearance("main", window, themePreference, systemUsesDarkColors);
  }

  applyPreviewWindowAppearance(window: BrowserWindow | null, themePreference: ThemePreference, systemUsesDarkColors: boolean) { return this.applyWindowAppearance("preview", window, themePreference, systemUsesDarkColors); }

  applySettingsWindowAppearance(window: BrowserWindow | null, themePreference: ThemePreference, systemUsesDarkColors: boolean) { return this.applyWindowAppearance("settings", window, themePreference, systemUsesDarkColors); }

  private applyWindowAppearance(surface: WindowPresentationSurface, window: BrowserWindow | null, themePreference: ThemePreference, systemUsesDarkColors: boolean) {
    this.themePreference = themePreference;
    if (!window || window.isDestroyed()) return false;
    const options = this.getBrowserOptions(surface, systemUsesDarkColors);
    window.setBackgroundColor(options.backgroundColor);
    if (options.titleBarOverlay) window.setTitleBarOverlay(options.titleBarOverlay);
    applyStableUiWindowMaterial(window, isCurrentStableUiDevelopmentEnabled(this.policy.mode), resolveWindowPresentationTheme(themePreference, systemUsesDarkColors));
    return true;
  }
}
