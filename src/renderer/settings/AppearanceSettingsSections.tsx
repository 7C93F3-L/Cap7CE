import { useRef, useState, type CSSProperties } from "react";
import { t } from "../../../electron/localization";
import type { AppearanceColors, LanguagePreference, ThemeMode } from "../../shared/types";
import { defaultAppearanceColors, getTextColorForBackground, isHexColor } from "../appearance";
import ColorPickerPopover from "../ColorPickerPopover";

export interface AppearanceSettingsSectionsProps {
  theme: ThemeMode;
  languagePreference: LanguagePreference;
  appearanceColors: AppearanceColors;
  menuStyle: CSSProperties;
  edgeCollapseEnabled: boolean;
  rememberWindowLayout: boolean;
  standbyLineVisible: boolean;
  launchAtLogin: boolean;
  systemNotificationsEnabled: boolean;
  operationHintsEnabled: boolean;
  onThemeChange: (theme: ThemeMode) => void;
  onLanguageChange: (language: LanguagePreference) => void;
  onAppearanceColorsPreview: (appearanceColors: AppearanceColors) => void;
  onAppearanceColorsChange: (appearanceColors: AppearanceColors) => void;
  onEdgeCollapseChange: (enabled: boolean) => void;
  onRememberWindowLayoutChange: (enabled: boolean) => void;
  onStandbyLineVisibleChange: (visible: boolean) => void;
  onLaunchAtLoginChange: (enabled: boolean) => void;
  onSystemNotificationsChange: (enabled: boolean) => void;
  onOperationHintsChange: (enabled: boolean) => void;
}

const getSettingsThemeLabels = (): Record<ThemeMode, string> => ({
  system: t("theme.system"),
  light: t("theme.light"),
  dark: t("theme.dark")
});

const getNextThemeMode = (currentTheme: ThemeMode): ThemeMode => {
  if (currentTheme === "system") return "light";
  if (currentTheme === "light") return "dark";
  return "system";
};

const getNextLanguagePreference = (currentLanguage: LanguagePreference): LanguagePreference => {
  if (currentLanguage === "system") return "zh-CN";
  if (currentLanguage === "zh-CN") return "en-US";
  return "system";
};

const getLanguagePreferenceLabel = (language: LanguagePreference) => {
  if (language === "zh-CN") return t("language.zhCN");
  if (language === "en-US") return t("language.enUS");
  return t("language.system");
};

export const AppearanceSettingsSections = ({
  theme,
  languagePreference,
  appearanceColors,
  menuStyle,
  edgeCollapseEnabled,
  rememberWindowLayout,
  standbyLineVisible,
  launchAtLogin,
  systemNotificationsEnabled,
  operationHintsEnabled,
  onThemeChange,
  onLanguageChange,
  onAppearanceColorsPreview,
  onAppearanceColorsChange,
  onEdgeCollapseChange,
  onRememberWindowLayoutChange,
  onStandbyLineVisibleChange,
  onLaunchAtLoginChange,
  onSystemNotificationsChange,
  onOperationHintsChange
}: AppearanceSettingsSectionsProps) => {
  const themeColorButtonRef = useRef<HTMLButtonElement | null>(null);
  const accentColorButtonRef = useRef<HTMLButtonElement | null>(null);
  const [activeColorPicker, setActiveColorPicker] = useState<keyof AppearanceColors | null>(null);

  const updateAppearanceColor = (key: keyof AppearanceColors, value: string) => {
    if (!isHexColor(value)) return;
    onAppearanceColorsChange({
      ...appearanceColors,
      [key]: value.toUpperCase()
    });
  };

  const previewAppearanceColor = (key: keyof AppearanceColors, value: string) => {
    if (!isHexColor(value)) return;
    onAppearanceColorsPreview({
      ...appearanceColors,
      [key]: value.toUpperCase()
    });
  };

  return (
    <>
      <section className="cap-settings-group cap-settings-split cap-settings-group-preferences">
        <div className="cap-settings-row">
          <span className="cap-settings-label">{t("settings.language")}</span>
          <button className="cap-settings-pill" type="button" onClick={() => onLanguageChange(getNextLanguagePreference(languagePreference))} title={t("settings.changeLanguageHint")}>
            {getLanguagePreferenceLabel(languagePreference)}
          </button>
        </div>
        <div className="cap-settings-row">
          <span className="cap-settings-label">{t("appearance.themeModeLabel")}</span>
          <button className="cap-settings-pill" type="button" onClick={() => onThemeChange(getNextThemeMode(theme))} title={t("settings.changeThemeHint")}>
            {getSettingsThemeLabels()[theme]}
          </button>
        </div>
        <div className="cap-settings-row cap-settings-wide">
          <span className="cap-settings-label">{t("appearance.configureLabel")}</span>
          <button
            ref={themeColorButtonRef}
            className="cap-settings-pill"
            type="button"
            title={t("settings.editThemeColorHint")}
            onClick={() => setActiveColorPicker("themeColor")}
          >
            {t("appearance.themeColor")} {appearanceColors.themeColor}
          </button>
          <button
            ref={accentColorButtonRef}
            className="cap-settings-pill"
            type="button"
            style={{
              "--chip-bg-hover": "var(--accent-color)",
              "--focus-border": "var(--accent-color)",
              "--theme-on-color": getTextColorForBackground(appearanceColors.accentColor)
            } as CSSProperties}
            title={t("settings.editAccentColorHint")}
            onClick={() => setActiveColorPicker("accentColor")}
          >
            {t("appearance.accentColor")} {appearanceColors.accentColor}
          </button>
          <button className="cap-settings-pill" type="button" onClick={() => onAppearanceColorsChange(defaultAppearanceColors)} title={t("settings.resetAppearanceHint")}>{t("common.restoreDefault")}</button>
        </div>
      </section>

      <section className="cap-settings-group cap-settings-split cap-settings-group-display">
        <div className="cap-settings-row cap-settings-row-half">
          <span className="cap-settings-label">{t("settings.standbyLine")}</span>
          <button className="cap-settings-pill" type="button" onClick={() => onStandbyLineVisibleChange(!standbyLineVisible)} title={standbyLineVisible ? t("settings.hideStandbyLineHint") : t("settings.showStandbyLineHint")}>
            {standbyLineVisible ? t("settings.visible") : t("settings.hidden")}
          </button>
        </div>
        <div className="cap-settings-row">
          <span className="cap-settings-label">{t("settings.rememberWindowLayout")}</span>
          <button className="cap-settings-pill" type="button" onClick={() => onRememberWindowLayoutChange(!rememberWindowLayout)} title={rememberWindowLayout ? t("settings.disableRememberWindowLayoutHint") : t("settings.enableRememberWindowLayoutHint")}>
            {rememberWindowLayout ? t("settings.enabled") : t("settings.disabled")}
          </button>
        </div>
        <div className="cap-settings-row">
          <span className="cap-settings-label">{t("settings.edgeCollapse")}</span>
          <button className="cap-settings-pill" type="button" onClick={() => onEdgeCollapseChange(!edgeCollapseEnabled)} title={edgeCollapseEnabled ? t("settings.disableEdgeCollapseHint") : t("settings.enableEdgeCollapseHint")}>
            {edgeCollapseEnabled ? t("settings.enabled") : t("settings.disabled")}
          </button>
        </div>
        <div className="cap-settings-row">
          <span className="cap-settings-label">{t("settings.operationHints")}</span>
          <button className="cap-settings-pill" type="button" onClick={() => onOperationHintsChange(!operationHintsEnabled)} title={operationHintsEnabled ? t("settings.disableOperationHintsHint") : t("settings.enableOperationHintsHint")}>
            {operationHintsEnabled ? t("settings.operationHintsOn") : t("settings.operationHintsOff")}
          </button>
        </div>
        <div className="cap-settings-row">
          <span className="cap-settings-label">{t("settings.systemNotifications")}</span>
          <button className="cap-settings-pill" type="button" onClick={() => onSystemNotificationsChange(!systemNotificationsEnabled)} title={systemNotificationsEnabled ? t("settings.disableSystemNotificationsHint") : t("settings.enableSystemNotificationsHint")}>
            {systemNotificationsEnabled ? t("settings.systemNotificationsOn") : t("settings.systemNotificationsOff")}
          </button>
        </div>
        <div className="cap-settings-row cap-settings-row-half">
          <span className="cap-settings-label">{t("settings.launchAtLogin")}</span>
          <button className="cap-settings-pill" type="button" onClick={() => onLaunchAtLoginChange(!launchAtLogin)} title={launchAtLogin ? t("settings.disableLaunchAtLoginHint") : t("settings.enableLaunchAtLoginHint")}>
            {launchAtLogin ? t("settings.launchAtLoginOn") : t("settings.launchAtLoginOff")}
          </button>
        </div>
      </section>

      {activeColorPicker && (
        <ColorPickerPopover
          key={activeColorPicker}
          anchorRef={activeColorPicker === "themeColor" ? themeColorButtonRef : accentColorButtonRef}
          value={appearanceColors[activeColorPicker]}
          ariaLabel={activeColorPicker === "themeColor" ? t("appearance.themeColor") : t("appearance.accentColor")}
          menuStyle={menuStyle}
          onPreview={(value) => previewAppearanceColor(activeColorPicker, value)}
          onCommit={(value) => updateAppearanceColor(activeColorPicker, value)}
          onClose={() => setActiveColorPicker(null)}
        />
      )}
    </>
  );
};
