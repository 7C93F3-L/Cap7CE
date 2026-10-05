import { useEffect, useRef } from "react";
import { t } from "../../../electron/localization";
import type { StableSidebarProps } from "../stable-ui/stableSidebarTypes";
import { createInitialResultGridScrollMemory } from "../virtualGridLayout";
import { useWorkspaceTabs } from "./useWorkspaceTabs";
import { workspaceTabsReducer, type WorkspaceSnapshot } from "./workspaceTabs";
import type { StableSkimProps } from "../stable-ui/stableSkimTypes";
import { useWorkspaceSkimRequests } from "./useWorkspaceSkimRequests";

export const useWorkspaceDirectoryNavigation = (sidebar: StableSidebarProps, skim: StableSkimProps) => {
  const snapshot: WorkspaceSnapshot = { search: sidebar.search, displayMode: "all", randomBrowse: { enabled: false, seed: 0, batchNumber: 0 }, scroll: createInitialResultGridScrollMemory(), selectedIds: [] };
  const { state, dispatch } = useWorkspaceTabs(snapshot);
  const lastDirectoryId = useRef("all");
  const skimOpen = state.activeId === "skim";
  const skimPresent = state.tabs.some((tab) => tab.kind === "skim");
  const openSkim = () => { if (!skimPresent) skim.onOpen(); dispatch({ type: "open-skim" }); };
  useWorkspaceSkimRequests(skim.requests, () => dispatch({ type: "open-skim" }), () => {
    if (skimOpen) dispatch({ type: "activate", id: lastDirectoryId.current }); else openSkim();
  });
  useEffect(() => {
    dispatch({ type: "open-directory", directoryId: sidebar.search.directoryId, initial: snapshot });
    lastDirectoryId.current = sidebar.search.directoryId === "all" ? "all" : `directory:${sidebar.search.directoryId}`;
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
    lastDirectoryId.current = directoryId === "all" ? "all" : `directory:${directoryId}`;
  };
  return {
    activeId: state.activeId,
    skimOpen, skimPresent, openSkim,
    tabs: state.tabs.flatMap((tab) => {
      if (tab.kind === "skim") return [{ id: "skim", name: t("skim.name"), path: skim.currentPath ?? undefined, closable: true }];
      const directory = sidebar.directories.find((item) => item.id === tab.directoryId);
      return [{ id: tab.id, name: tab.kind === "all" ? t("stableUi.sidebar.allDirectories") : directory?.name ?? tab.directoryId, path: directory?.path, closable: tab.kind !== "all" }];
    }),
    selectDirectory,
    select: (id: string) => { const tab = state.tabs.find((item) => item.id === id); if (tab?.kind === "skim") openSkim(); else if (tab) selectDirectory(tab.directoryId); },
    close: (id: string) => {
      const next = workspaceTabsReducer(state, { type: "close", id });
      dispatch({ type: "close", id });
      if (lastDirectoryId.current === id) lastDirectoryId.current = "all";
      if (next.activeId !== state.activeId) {
        const tab = next.tabs.find((item) => item.id === next.activeId);
        if (tab && tab.kind !== "skim") sidebar.onSearchOptionsChange({ ...sidebar.search, directoryId: tab.directoryId });
      }
    }
  };
};
