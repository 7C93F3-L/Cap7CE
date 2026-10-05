import type { SearchState, SkimDisplayMode } from "../../shared/types";
import type { ResultGridScrollMemory } from "../virtualGridLayout";

export interface WorkspaceSnapshot {
  search: SearchState;
  displayMode: SkimDisplayMode;
  randomBrowse: { enabled: boolean; seed: number; batchNumber: number };
  scroll: ResultGridScrollMemory;
  selectedIds: string[];
}

export type WorkspaceTab =
  | { id: string; kind: "all" | "directory"; directoryId: string; snapshot: WorkspaceSnapshot }
  | { id: "skim"; kind: "skim" };

export interface WorkspaceTabsState {
  tabs: WorkspaceTab[];
  activeId: string;
}

export type WorkspaceTabsAction =
  | { type: "open-directory"; directoryId: string; initial: WorkspaceSnapshot }
  | { type: "open-skim" }
  | { type: "activate"; id: string }
  | { type: "close"; id: string }
  | { type: "snapshot"; id: string; snapshot: WorkspaceSnapshot };

export const allWorkspaceTabId = "all";
const directoryTabId = (directoryId: string) => directoryId === "all" ? allWorkspaceTabId : `directory:${directoryId}`;
const copySnapshot = (snapshot: WorkspaceSnapshot, directoryId: string): WorkspaceSnapshot => ({
  ...structuredClone(snapshot), search: { ...structuredClone(snapshot.search), directoryId }
});

export const createWorkspaceTabs = (initial: WorkspaceSnapshot): WorkspaceTabsState => ({
  tabs: [{ id: allWorkspaceTabId, kind: "all", directoryId: "all", snapshot: copySnapshot(initial, "all") }],
  activeId: allWorkspaceTabId
});

export const workspaceTabsReducer = (state: WorkspaceTabsState, action: WorkspaceTabsAction): WorkspaceTabsState => {
  if (action.type === "open-directory" || action.type === "open-skim") {
    if (action.type === "open-directory" && !action.directoryId.trim()) return state;
    const id = action.type === "open-skim" ? "skim" : directoryTabId(action.directoryId);
    if (state.tabs.some((tab) => tab.id === id)) return state.activeId === id ? state : { ...state, activeId: id };
    const tab: WorkspaceTab = action.type === "open-skim" ? { id: "skim", kind: "skim" } : {
      id, kind: "directory", directoryId: action.directoryId, snapshot: copySnapshot(action.initial, action.directoryId)
    };
    return { tabs: [...state.tabs, tab], activeId: id };
  }
  const index = state.tabs.findIndex((tab) => tab.id === action.id);
  if (index < 0) return state;
  if (action.type === "activate") return state.activeId === action.id ? state : { ...state, activeId: action.id };
  if (action.type === "close") {
    if (action.id === allWorkspaceTabId) return state;
    const tabs = state.tabs.filter((tab) => tab.id !== action.id);
    return { tabs, activeId: state.activeId === action.id ? tabs[Math.max(0, index - 1)].id : state.activeId };
  }
  const current = state.tabs[index];
  if (current.kind === "skim") return state;
  const tabs = [...state.tabs];
  tabs[index] = { ...current, snapshot: copySnapshot(action.snapshot, current.directoryId) };
  return { ...state, tabs };
};
