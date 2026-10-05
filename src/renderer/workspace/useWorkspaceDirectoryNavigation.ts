import { useEffect } from "react";
import { t } from "../../../electron/localization";
import type { WorkspaceSearchBridge } from "../../shared/workspaceTypes";
import type { StableSidebarProps } from "../stable-ui/stableSidebarTypes";
import type { StableSkimProps } from "../stable-ui/stableSkimTypes";
import { useWorkspaceSkimRequests } from "./useWorkspaceSkimRequests";

export const useWorkspaceDirectoryNavigation = (sidebar: StableSidebarProps, skim: StableSkimProps, workspace: WorkspaceSearchBridge) => {
  const skimOpen = workspace.activeId === "skim";
  const skimPresent = workspace.identities.some((tab) => tab.kind === "skim");
  const openSkim = () => { if (!skimPresent) skim.onOpen(); workspace.openSkim(); };
  useWorkspaceSkimRequests(skim.requests, workspace.openSkim, () => {
    if (skimOpen) workspace.selectDirectory(workspace.activeDirectoryId); else openSkim();
  });
  useEffect(() => {
    if (sidebar.search.directoryId !== workspace.activeDirectoryId) workspace.selectDirectory(sidebar.search.directoryId);
  }, [sidebar.search.directoryId, workspace.activeDirectoryId]);
  useEffect(() => {
    if (sidebar.isLoadingDirectories || sidebar.directoryServiceUnavailable) return;
    for (const tab of workspace.identities) {
      if (tab.kind === "directory" && !sidebar.directories.some((directory) => directory.id === tab.directoryId)) workspace.close(tab.id);
    }
  }, [sidebar.directories, sidebar.isLoadingDirectories, sidebar.directoryServiceUnavailable, workspace.identities]);
  return {
    ...workspace, skimOpen, skimPresent, openSkim,
    tabs: workspace.identities.map((tab) => {
      if (tab.kind === "skim") return { id: "skim", name: t("skim.name"), path: skim.currentPath ?? undefined, closable: true };
      const directory = sidebar.directories.find((item) => item.id === tab.directoryId);
      return { id: tab.id, name: tab.kind === "all" ? t("stableUi.sidebar.allDirectories") : directory?.name ?? tab.directoryId, path: directory?.path, closable: tab.kind !== "all" };
    })
  };
};
