import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { AppearanceColors, PreviewWindowData, ThemeMode, UiFontSize, UserPreferences, WindowMaterial } from "../../shared/types";
import { getTextColorForBackground } from "../appearance";
import { useSystemThemeMode } from "../controllers/useSystemThemeMode";
import { defaultUiFontSize, useUiFontSize } from "../typography";

export const usePreviewAppearance = (previewData: PreviewWindowData | null) => {
  const [themePreference, setThemePreference] = useState<ThemeMode | null>(null);
  const [appearanceColors, setAppearanceColors] = useState<AppearanceColors | null>(null);
  const [uiFontSize, setUiFontSize] = useState<UiFontSize>(defaultUiFontSize);
  const [windowMaterial, setWindowMaterial] = useState<WindowMaterial>("acrylic");
  const systemTheme = useSystemThemeMode();
  const uiFontStyle = useUiFontSize(uiFontSize);

  useEffect(() => {
    const applyPreferences = (preferences: UserPreferences) => {
      setThemePreference(preferences.themePreference);
      setAppearanceColors(preferences.appearanceColors);
      setUiFontSize(preferences.uiFontSize);
      setWindowMaterial(preferences.windowMaterial);
    };
    void window.cap7ce?.preferences.get().then((preferences) => {
      if (preferences) applyPreferences(preferences);
    });
    return window.cap7ce?.preferences.onChanged(applyPreferences);
  }, []);

  const effectiveTheme = themePreference === null
    ? previewData?.theme ?? systemTheme
    : themePreference === "system" ? systemTheme : themePreference;
  const effectiveAppearanceColors = appearanceColors ?? previewData?.appearanceColors;
  const themeStyle = useMemo(() => {
    if (!effectiveAppearanceColors) return {} as CSSProperties;
    const isDark = effectiveTheme === "dark";
    return {
      ...uiFontStyle,
      "--theme-color": effectiveAppearanceColors.themeColor,
      "--accent-color": effectiveAppearanceColors.accentColor,
      "--preview-action-hover-text": getTextColorForBackground(effectiveAppearanceColors.themeColor, effectiveAppearanceColors.accentColor),
      "--app-bg": isDark ? "#191919" : "#ffffff",
      "--panel-bg": isDark ? "#282828" : "#f2f2f2",
      "--text-main": isDark ? "#b2b2b2" : "#111111",
      "--icon-muted": isDark ? "#4f4f4f" : "#777777",
      "--border-soft": isDark ? "#2a2a2a" : "#ececec"
    } as CSSProperties;
  }, [effectiveAppearanceColors, effectiveTheme, uiFontStyle]);

  return { effectiveTheme, themeStyle, windowMaterial };
};
