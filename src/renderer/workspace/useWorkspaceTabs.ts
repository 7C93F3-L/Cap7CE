import { useReducer } from "react";
import { createWorkspaceTabs, workspaceTabsReducer, type WorkspaceSnapshot } from "./workspaceTabs";

export const useWorkspaceTabs = (initial: WorkspaceSnapshot) => {
  const [state, dispatch] = useReducer(workspaceTabsReducer, initial, createWorkspaceTabs);
  return { state, dispatch, activeTab: state.tabs.find((tab) => tab.id === state.activeId)! };
};
