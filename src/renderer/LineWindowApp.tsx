import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { AppearanceColors, ThemeMode } from "../shared/types";

const defaultAppearanceColors: AppearanceColors = {
  themeColor: "#7C93F3",
  accentColor: "#68C3C0"
};

const isHexColor = (value: unknown): value is string => (
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
);

const LineWindowApp = () => {
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() => (
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  ));
  const [appearanceColors, setAppearanceColors] = useState(defaultAppearanceColors);

  const refreshAppearance = useCallback(async () => {
    const preferences = await window.imageEverything?.preferences.get();
    if (!preferences) return;
    setTheme(preferences.themePreference);
    setAppearanceColors({
      themeColor: isHexColor(preferences.appearanceColors.themeColor)
        ? preferences.appearanceColors.themeColor
        : defaultAppearanceColors.themeColor,
      accentColor: isHexColor(preferences.appearanceColors.accentColor)
        ? preferences.appearanceColors.accentColor
        : defaultAppearanceColors.accentColor
    });
  }, []);

  useEffect(() => {
    void refreshAppearance();
    return window.imageEverything?.line.onRefreshAppearance(refreshAppearance);
  }, [refreshAppearance]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return undefined;
    const handleChange = () => setSystemTheme(media.matches ? "dark" : "light");
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const effectiveTheme = theme === "system" ? systemTheme : theme;
  const style = {
    "--theme-color": appearanceColors.themeColor,
    "--accent-color": appearanceColors.accentColor
  } as CSSProperties;

  return (
    <div className={`app theme-${effectiveTheme} cap-shell cap-line-window`} style={style}>
      <div className="cap-standby-line" aria-hidden="true" />
    </div>
  );
};

export default LineWindowApp;
