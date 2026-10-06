import { useEffect, useState, type CSSProperties } from "react";
import { resolveLanguagePreference, setActiveLanguage } from "../../../electron/localization";
import type { UserPreferences } from "../../shared/types";
import { defaultAppearanceColors, getTextColorForBackground } from "../appearance";
import { useSystemThemeMode } from "../controllers/useSystemThemeMode";
import { useUiFontSize } from "../typography";

// Read-only root preferences. Event delivery supersedes an older initial read.
export function useCatalogApplicationPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const systemTheme = useSystemThemeMode();
  useEffect(() => {
    let live = true, revision = 0;
    const apply = (value: UserPreferences) => {
      if (!live) return;
      setActiveLanguage(resolveLanguagePreference(value.languagePreference, navigator.language));
      setPreferences(value);
    };
    const observed = revision;
    const unsubscribe = window.cap7ce?.preferences.onChanged(value => { revision++; apply(value); });
    void window.cap7ce?.preferences.get().then(value => {
      if (value && live && revision === observed) apply(value);
    }).catch(() => undefined);
    return () => { live = false; unsubscribe?.(); };
  }, []);
  const themePreference = preferences?.themePreference ?? "system";
  const theme = themePreference === "system" ? systemTheme : themePreference;
  const appearanceColors = preferences?.appearanceColors ?? defaultAppearanceColors;
  const uiFontStyle = useUiFontSize(preferences?.uiFontSize);
  const themeStyle = { ...uiFontStyle, "--theme-color": appearanceColors.themeColor,
    "--accent-color": appearanceColors.accentColor,
    "--dialog-action-hover-text": getTextColorForBackground(appearanceColors.themeColor, appearanceColors.accentColor),
    "--theme-on-color": getTextColorForBackground(appearanceColors.themeColor),
    "--accent-on-color": getTextColorForBackground(appearanceColors.accentColor) } as CSSProperties;
  return { preferences, theme, appearanceColors, themeStyle, windowMaterial: preferences?.windowMaterial ?? "acrylic" };
}
