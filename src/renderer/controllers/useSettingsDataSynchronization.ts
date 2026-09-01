import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { resolveLanguagePreference, setActiveLanguage } from "../../../electron/localization";
import type {
  AppearanceColors,
  DirectoryItem,
  LanguagePreference,
  ShortcutActionPreferences,
  SkimDisplayPreferences,
  ThemeMode,
  UserPreferences
} from "../../shared/types";
import type { SearchCapsuleLabelVisibility } from "../search/Cap7CESearchCapsule";

interface SettingsDataSynchronizationOptions {
  setTheme: Dispatch<SetStateAction<ThemeMode>>;
  setLanguagePreference: Dispatch<SetStateAction<LanguagePreference>>;
  setResolvedLanguage: Dispatch<SetStateAction<"zh-CN" | "en-US">>;
  setAppearanceColors: Dispatch<SetStateAction<AppearanceColors>>;
  setStandbyLineVisible: Dispatch<SetStateAction<boolean>>;
  setLaunchAtLogin: Dispatch<SetStateAction<boolean>>;
  setSystemNotificationsEnabled: Dispatch<SetStateAction<boolean>>;
  setOperationHintsEnabled: Dispatch<SetStateAction<boolean>>;
  setAiRecognitionEnabled: Dispatch<SetStateAction<boolean>>;
  setQuickActionGlobalEnabled: Dispatch<SetStateAction<boolean>>;
  setCommandEnabled: Dispatch<SetStateAction<boolean>>;
  setShortcutActions: Dispatch<SetStateAction<ShortcutActionPreferences>>;
  setSearchCapsuleLabelVisibility: Dispatch<SetStateAction<SearchCapsuleLabelVisibility>>;
  setSkimDisplay: Dispatch<SetStateAction<SkimDisplayPreferences>>;
  setSkimSidebarFolders: Dispatch<SetStateAction<string[]>>;
  setSkimSystemLocationsCollapsed: Dispatch<SetStateAction<boolean>>;
  refreshDirectories: (directories: DirectoryItem[]) => void;
}

export const useSettingsDataSynchronization = (options: SettingsDataSynchronizationOptions) => {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => window.cap7ce?.preferences.onChanged((preferences: UserPreferences) => {
    const current = optionsRef.current;
    const resolvedLanguage = resolveLanguagePreference(preferences.languagePreference, navigator.language);
    setActiveLanguage(resolvedLanguage);
    current.setTheme(preferences.themePreference);
    current.setLanguagePreference(preferences.languagePreference);
    current.setResolvedLanguage(resolvedLanguage);
    current.setAppearanceColors(preferences.appearanceColors);
    current.setStandbyLineVisible(preferences.standbyLineVisible);
    current.setLaunchAtLogin(preferences.launchAtLogin);
    current.setSystemNotificationsEnabled(preferences.systemNotificationsEnabled);
    current.setOperationHintsEnabled(preferences.operationHintsEnabled);
    current.setAiRecognitionEnabled(preferences.aiRecognitionEnabled);
    current.setQuickActionGlobalEnabled(preferences.quickActionGlobalEnabled);
    current.setCommandEnabled(preferences.commandEnabled);
    current.setShortcutActions(preferences.shortcutActions);
    current.setSearchCapsuleLabelVisibility(preferences.searchLabelVisibility);
    current.setSkimDisplay(preferences.skimDisplay);
    current.setSkimSidebarFolders(preferences.skimSidebarFolders);
    current.setSkimSystemLocationsCollapsed(preferences.skimSystemLocationsCollapsed);
  }), []);

  useEffect(() => window.cap7ce?.directories.onChanged((directories) => {
    optionsRef.current.refreshDirectories(directories);
  }), []);

  useEffect(() => window.cap7ce?.preferences.onStandbyLineVisibleChanged((visible) => {
    optionsRef.current.setStandbyLineVisible(visible);
  }), []);

  useEffect(() => window.cap7ce?.preferences.onLanguageChanged((preference, resolvedLanguage) => {
    setActiveLanguage(resolvedLanguage);
    optionsRef.current.setLanguagePreference(preference);
    optionsRef.current.setResolvedLanguage(resolvedLanguage);
  }), []);
};
