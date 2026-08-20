import type { UserPreferencesResponse } from "./preferenceStore";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";

type PreferenceUpdater<T> = (value: T) => Promise<UserPreferencesResponse>;

export interface PreferenceIpcDependencies {
  registrar: IpcRegistrar;
  getPreferences: () => Promise<UserPreferencesResponse>;
  updateSkimSort: PreferenceUpdater<UserPreferencesResponse["skimSortPreference"]>;
  updateOperationHints: PreferenceUpdater<boolean>;
  updateCommandEnabled: PreferenceUpdater<boolean>;
  updateSearchLabelVisibility: PreferenceUpdater<UserPreferencesResponse["searchLabelVisibility"]>;
  updateSkimDisplay: PreferenceUpdater<UserPreferencesResponse["skimDisplay"]>;
  updateSkimSidebarFolders: PreferenceUpdater<string[]>;
  updateSkimSystemLocationsCollapsed: PreferenceUpdater<boolean>;
}

export const registerPreferenceIpc = ({
  registrar,
  getPreferences,
  updateSkimSort,
  updateOperationHints,
  updateCommandEnabled,
  updateSearchLabelVisibility,
  updateSkimDisplay,
  updateSkimSidebarFolders,
  updateSkimSystemLocationsCollapsed
}: PreferenceIpcDependencies): void => {
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
          updateSkimSort(skimSortPreference)
        )
      },
      {
        kind: "handle",
        channel: "preferences:updateOperationHints",
        listener: (_event, nextEnabled: boolean) => updateOperationHints(Boolean(nextEnabled))
      },
      {
        kind: "handle",
        channel: "preferences:updateCommandEnabled",
        listener: (_event, nextEnabled: boolean) => updateCommandEnabled(Boolean(nextEnabled))
      },
      {
        kind: "handle",
        channel: "preferences:updateSearchLabelVisibility",
        listener: (_event, nextVisibility: UserPreferencesResponse["searchLabelVisibility"]) => (
          updateSearchLabelVisibility({
            directory: Boolean(nextVisibility?.directory),
            recognition: Boolean(nextVisibility?.recognition),
            sort: Boolean(nextVisibility?.sort),
            format: Boolean(nextVisibility?.format),
            skimDisplay: Boolean(nextVisibility?.skimDisplay)
          })
        )
      },
      {
        kind: "handle",
        channel: "preferences:updateSkimDisplay",
        listener: (_event, nextSkimDisplay: UserPreferencesResponse["skimDisplay"]) => (
          updateSkimDisplay(nextSkimDisplay)
        )
      },
      {
        kind: "handle",
        channel: "preferences:updateSkimSidebarFolders",
        listener: (_event, skimSidebarFolders: string[]) => updateSkimSidebarFolders(skimSidebarFolders)
      },
      {
        kind: "handle",
        channel: "preferences:updateSkimSystemLocationsCollapsed",
        listener: (_event, collapsed: boolean) => updateSkimSystemLocationsCollapsed(collapsed)
      }
    ]
  });
};
