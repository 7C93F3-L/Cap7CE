import { useEffect } from "react";
import { t } from "../../../electron/localization";
import type { StableSidebarProps } from "../stable-ui/stableSidebarTypes";
import { createInitialResultGridScrollMemory } from "../virtualGridLayout";
import { useWorkspaceTabs } from "./useWorkspaceTabs";
import { workspaceTabsReducer, type WorkspaceSnapshot } from "./workspaceTabs";

export const useWorkspaceDirectoryNavigation = (sidebar: StableSidebarProps) => {
  const snapshot: WorkspaceSnapshot = { search: sidebar.search, displayMode: "all", randomBrowse: { enabled: false, seed: 0, batchNumber: 0 }, scroll: createInitialResultGridScrollMemory(), selectedIds: [] };
  const { state, dispatch } = useWorkspaceTabs(snapshot);
  useEffect(() => {
    dispatch({ type: "open-directory", directoryId: sidebar.search.directoryId, initial: snapshot });
  }, [sidebar.search.directoryId]);
  useEffect(() => {
    if (sidebar.isLoadingDirectories || sidebar.directoryServiceUnavailable) return;
    for (const tab of state.tabs) {
      if (tab.kind === "directory" && !sidebar.directories.some((directory) => directory.id === tab.directoryId)) dispatch({ type: "close", id: tab.id });
    }
  }, [sidebar.directories, sidebar.isLoadingDirectories, sidebar.directoryServiceUnavailable, state.tabs]);
  const selectDirectory = (directoryId: string) => {
    dispatch({ type: "open-directory", directoryId, initial: snapshot });
    if (directoryId !== sidebar.search.directoryId) sidebar.onSearchOptionsChange({ ...sidebar.search, directoryId });
  };
  return {
    activeId: state.activeId,
    tabs: state.tabs.flatMap((tab) => {
      if (tab.kind === "skim") return [];
      const directory = sidebar.directories.find((item) => item.id === tab.directoryId);
      return [{ id: tab.id, name: tab.kind === "all" ? t("stableUi.sidebar.allDirectories") : directory?.name ?? tab.directoryId, path: directory?.path, closable: tab.kind !== "all" }];
    }),
    selectDirectory,
    select: (id: string) => { const tab = state.tabs.find((item) => item.id === id); if (tab && tab.kind !== "skim") selectDirectory(tab.directoryId); },
    close: (id: string) => {
      const next = workspaceTabsReducer(state, { type: "close", id });
      dispatch({ type: "close", id });
      if (next.activeId !== state.activeId) {
        const tab = next.tabs.find((item) => item.id === next.activeId);
        if (tab && tab.kind !== "skim") sidebar.onSearchOptionsChange({ ...sidebar.search, directoryId: tab.directoryId });
      }
    }
  };
};
