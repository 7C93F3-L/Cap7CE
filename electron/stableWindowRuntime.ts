import type { BrowserWindow } from "electron";
import {
  applyStableUiWindowMaterial,
  getStableWindowBrowserOptions,
  resolveStableWindowTheme,
  type StableWindowSurface,
  type WindowMaterial
} from "./stableUiWindowLifecycle";

type ThemePreference = "system" | "light" | "dark";

export class StableWindowRuntime {
  private themePreference: ThemePreference = "system";
  private materialPreference: WindowMaterial = "acrylic";

  configure(themePreference: ThemePreference, materialPreference: WindowMaterial = "acrylic") {
    this.themePreference = themePreference;
    this.materialPreference = materialPreference;
  }

  setMaterialPreference(materialPreference: WindowMaterial) { this.materialPreference = materialPreference; }
  get usesSystemTheme() { return this.themePreference === "system"; }

  getBrowserOptions(_surface: StableWindowSurface, systemUsesDarkColors: boolean) {
    return getStableWindowBrowserOptions(resolveStableWindowTheme(this.themePreference, systemUsesDarkColors));
  }

  applyMainWindowAppearance(window: BrowserWindow | null, themePreference: ThemePreference, systemUsesDarkColors: boolean) {
    return this.applyWindowAppearance(window, themePreference, systemUsesDarkColors);
  }

  applyPreviewWindowAppearance(window: BrowserWindow | null, themePreference: ThemePreference, systemUsesDarkColors: boolean) {
    return this.applyWindowAppearance(window, themePreference, systemUsesDarkColors);
  }

  applySettingsWindowAppearance(window: BrowserWindow | null, themePreference: ThemePreference, systemUsesDarkColors: boolean) {
    return this.applyWindowAppearance(window, themePreference, systemUsesDarkColors);
  }

  private applyWindowAppearance(window: BrowserWindow | null, themePreference: ThemePreference, systemUsesDarkColors: boolean) {
    this.themePreference = themePreference;
    if (!window || window.isDestroyed()) return false;
    const theme = resolveStableWindowTheme(themePreference, systemUsesDarkColors);
    const options = getStableWindowBrowserOptions(theme);
    window.setBackgroundColor(options.backgroundColor);
    window.setTitleBarOverlay(options.titleBarOverlay);
    applyStableUiWindowMaterial(window, theme, this.materialPreference);
    return true;
  }
}
