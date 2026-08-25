import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { AppearanceColors, ThemeMode } from "../shared/types";
import "./LineWindowApp.css";

type LineEdge = "left" | "right" | "top" | "bottom";

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
  const [edge, setEdge] = useState<LineEdge>("bottom");

  const refreshAppearance = useCallback(async () => {
    const preferences = await window.cap7ce?.preferences.get();
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
    return window.cap7ce?.line.onRefreshAppearance(refreshAppearance);
  }, [refreshAppearance]);

  useEffect(() => window.cap7ce?.line.onPlacementChanged(setEdge), []);

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
    <div
      className={`app theme-${effectiveTheme} cap-shell cap-line-window cap-line-window-${edge}`}
      style={style}
      onClick={() => void window.cap7ce?.line.activateCapsule()}
    >
      <div className="cap-standby-line" aria-hidden="true" />
    </div>
  );
};

export default LineWindowApp;
