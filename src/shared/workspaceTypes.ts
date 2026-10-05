export interface WorkspaceTabItem {
  id: string;
  name: string;
  path?: string;
  closable: boolean;
}

export type WorkspaceTabIdentity = { id: string; kind: "all" | "directory"; directoryId: string } | { id: "skim"; kind: "skim" };
export interface WorkspaceSelectionMemory { ids: string[]; onChange: (ids: string[]) => void; }
export interface WorkspaceSearchBridge {
  identities: WorkspaceTabIdentity[];
  activeId: string;
  activeDirectoryId: string;
  viewKey: string;
  selectionMemory: WorkspaceSelectionMemory;
  selectDirectory: (id: string) => void;
  openSkim: () => void;
  select: (id: string) => void;
  close: (id: string) => void;
}
