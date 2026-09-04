import type { UserPreferencesResponse } from "./preferenceStore";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";

type PreferenceUpdater<T> = (value: T) => Promise<UserPreferencesResponse>;
type ThemePreference = UserPreferencesResponse["themePreference"];
type LanguagePreference = UserPreferencesResponse["languagePreference"];
type SortPreference = UserPreferencesResponse["sortPreference"];
type AppearanceColors = UserPreferencesResponse["appearanceColors"];
type WindowMaterialPreference = UserPreferencesResponse["windowMaterial"];

export interface PreferenceIpcDependencies {
  registrar: IpcRegistrar;
  getPreferences: () => Promise<UserPreferencesResponse>;
  broadcastPreferencesChanged: (preferences: UserPreferencesResponse) => void;
  updateSkimSort: PreferenceUpdater<UserPreferencesResponse["skimSortPreference"]>;
  updateOperationHints: PreferenceUpdater<boolean>;
  updateCommandEnabled: PreferenceUpdater<boolean>;
  updateSearchLabelVisibility: PreferenceUpdater<UserPreferencesResponse["searchLabelVisibility"]>;
  updateSkimDisplay: PreferenceUpdater<UserPreferencesResponse["skimDisplay"]>;
  updateSkimSidebarFolders: PreferenceUpdater<string[]>;
  updateSkimSystemLocationsCollapsed: PreferenceUpdater<boolean>;
  updateTheme: PreferenceUpdater<ThemePreference>;
  updateWindowMaterial: PreferenceUpdater<WindowMaterialPreference>;
  refreshAppearance: () => void;
  applyLanguage: PreferenceUpdater<LanguagePreference>;
  updateSort: PreferenceUpdater<SortPreference>;
  applyThumbnailSort: (sortPreference: SortPreference) => void;
  updateAppearanceColors: PreferenceUpdater<AppearanceColors>;
  setEdgeCollapseEnabled: PreferenceUpdater<boolean>;
  setRememberWindowLayout: PreferenceUpdater<boolean>;
  updateWindowPresentationMode: PreferenceUpdater<UserPreferencesResponse["windowPresentationMode"]>;
  setStandbyLineVisible: PreferenceUpdater<boolean>;
  updateLaunchAtLogin: PreferenceUpdater<boolean>;
  applyLaunchAtLogin: (enabled: boolean) => void;
  updateSystemNotifications: PreferenceUpdater<boolean>;
  applySystemNotifications: (enabled: boolean) => void;
  updateAutoCacheOptimization: PreferenceUpdater<boolean>;
  updateAiRecognitionEnabled: PreferenceUpdater<boolean>;
  setAutoCacheOptimizationEnabled: (enabled: boolean) => Promise<void>;
  scheduleAutoCacheOptimization: () => Promise<void>;
}

export const registerPreferenceIpc = ({
  registrar,
  getPreferences,
  broadcastPreferencesChanged,
  updateSkimSort,
  updateOperationHints,
  updateCommandEnabled,
  updateSearchLabelVisibility,
  updateSkimDisplay,
  updateSkimSidebarFolders,
  updateSkimSystemLocationsCollapsed,
  updateTheme,
  updateWindowMaterial,
  refreshAppearance,
  applyLanguage,
  updateSort,
  applyThumbnailSort,
  updateAppearanceColors,
  setEdgeCollapseEnabled,
  setRememberWindowLayout,
  updateWindowPresentationMode,
  setStandbyLineVisible,
  updateLaunchAtLogin,
  applyLaunchAtLogin,
  updateSystemNotifications,
  applySystemNotifications,
  updateAutoCacheOptimization,
  updateAiRecognitionEnabled,
  setAutoCacheOptimizationEnabled,
  scheduleAutoCacheOptimization
}: PreferenceIpcDependencies): void => {
  const updateAndBroadcast = async (operation: Promise<UserPreferencesResponse>) => {
    const preferences = await operation;
    broadcastPreferencesChanged(preferences);
    return preferences;
  };
  registerIpcDomain({
    registrar,
    registrations: [
      {
        kind: "handle",
        channel: "preferences:get",
        listener: () => getPreferences()
      },
      {
        kind: "handle",
        channel: "preferences:updateSkimSort",
        listener: (_event, skimSortPreference: UserPreferencesResponse["skimSortPreference"]) => (
          updateAndBroadcast(updateSkimSort(skimSortPreference))
        )
      },
      {
        kind: "handle",
        channel: "preferences:updateOperationHints",
        listener: (_event, nextEnabled: boolean) => updateAndBroadcast(updateOperationHints(Boolean(nextEnabled)))
      },
      {
        kind: "handle",
        channel: "preferences:updateCommandEnabled",
        listener: (_event, nextEnabled: boolean) => updateAndBroadcast(updateCommandEnabled(Boolean(nextEnabled)))
      },
      {
        kind: "handle",
        channel: "preferences:updateSearchLabelVisibility",
        listener: (_event, nextVisibility: UserPreferencesResponse["searchLabelVisibility"]) => (
          updateAndBroadcast(updateSearchLabelVisibility({
            directory: Boolean(nextVisibility?.directory),
            sort: Boolean(nextVisibility?.sort),
            format: Boolean(nextVisibility?.format),
            skimDisplay: Boolean(nextVisibility?.skimDisplay),
            ai: Boolean(nextVisibility?.ai)
          }))
        )
      },
      {
        kind: "handle",
        channel: "preferences:updateSkimDisplay",
        listener: (_event, nextSkimDisplay: UserPreferencesResponse["skimDisplay"]) => (
          updateAndBroadcast(updateSkimDisplay(nextSkimDisplay))
        )
      },
      {
        kind: "handle",
        channel: "preferences:updateSkimSidebarFolders",
        listener: (_event, skimSidebarFolders: string[]) => updateAndBroadcast(updateSkimSidebarFolders(skimSidebarFolders))
      },
      {
        kind: "handle",
        channel: "preferences:updateSkimSystemLocationsCollapsed",
        listener: (_event, collapsed: boolean) => updateAndBroadcast(updateSkimSystemLocationsCollapsed(collapsed))
      },
      {
        kind: "handle",
        channel: "preferences:updateTheme",
        listener: async (_event, themePreference: ThemePreference) => {
          const preferences = await updateTheme(themePreference);
          refreshAppearance();
          broadcastPreferencesChanged(preferences);
          return preferences;
        }
      },
      {
        kind: "handle",
        channel: "preferences:updateWindowMaterial",
        listener: async (_event, material: WindowMaterialPreference) => {
          const preferences = await updateWindowMaterial(material === "mica" ? "mica" : "acrylic");
          refreshAppearance();
          broadcastPreferencesChanged(preferences);
          return preferences;
        }
      },
      {
        kind: "handle",
        channel: "preferences:updateLanguage",
        listener: (_event, languagePreference: LanguagePreference) => {
          const nextLanguagePreference = languagePreference === "zh-CN" || languagePreference === "en-US"
            ? languagePreference
            : "system";
          return updateAndBroadcast(applyLanguage(nextLanguagePreference));
        }
      },
      {
        kind: "handle",
        channel: "preferences:updateSort",
        listener: async (_event, sortPreference: SortPreference) => {
          const preferences = await updateSort(sortPreference);
          applyThumbnailSort(preferences.sortPreference);
          broadcastPreferencesChanged(preferences);
          return preferences;
        }
      },
      {
        kind: "handle",
        channel: "preferences:updateAppearanceColors",
        listener: async (_event, appearanceColors: AppearanceColors) => {
          const preferences = await updateAppearanceColors(appearanceColors);
          refreshAppearance();
          broadcastPreferencesChanged(preferences);
          return preferences;
        }
      },
      {
        kind: "handle",
        channel: "preferences:updateEdgeCollapse",
        listener: (_event, nextEnabled: boolean) => updateAndBroadcast(setEdgeCollapseEnabled(Boolean(nextEnabled)))
      },
      {
        kind: "handle",
        channel: "preferences:updateRememberWindowLayout",
        listener: (_event, nextEnabled: boolean) => updateAndBroadcast(setRememberWindowLayout(Boolean(nextEnabled)))
      },
      {
        kind: "handle",
        channel: "preferences:updateWindowPresentationMode",
        listener: (_event, mode: UserPreferencesResponse["windowPresentationMode"]) => updateAndBroadcast(updateWindowPresentationMode(mode))
      },
      {
        kind: "handle",
        channel: "preferences:updateStandbyLineVisible",
        listener: (_event, nextVisible: boolean) => updateAndBroadcast(setStandbyLineVisible(Boolean(nextVisible)))
      },
      {
        kind: "handle",
        channel: "preferences:updateLaunchAtLogin",
        listener: async (_event, nextEnabled: boolean) => {
          const preferences = await updateLaunchAtLogin(Boolean(nextEnabled));
          applyLaunchAtLogin(preferences.launchAtLogin);
          broadcastPreferencesChanged(preferences);
          return preferences;
        }
      },
      {
        kind: "handle",
        channel: "preferences:updateSystemNotifications",
        listener: async (_event, nextEnabled: boolean) => {
          const preferences = await updateSystemNotifications(Boolean(nextEnabled));
          applySystemNotifications(preferences.systemNotificationsEnabled);
          broadcastPreferencesChanged(preferences);
          return preferences;
        }
      },
      {
        kind: "handle",
        channel: "preferences:updateAiRecognitionEnabled",
        listener: (_event, nextEnabled: boolean) => updateAndBroadcast(updateAiRecognitionEnabled(Boolean(nextEnabled)))
      },
      {
        kind: "handle",
        channel: "preferences:updateAutoCacheOptimization",
        listener: async (_event, nextEnabled: boolean) => {
          const preferences = await updateAutoCacheOptimization(Boolean(nextEnabled));
          await setAutoCacheOptimizationEnabled(preferences.autoCacheOptimizationEnabled);
          if (preferences.autoCacheOptimizationEnabled) {
            await scheduleAutoCacheOptimization();
          }
          broadcastPreferencesChanged(preferences);
          return preferences;
        }
      }
    ]
  });
};
