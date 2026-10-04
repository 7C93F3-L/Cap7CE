import type { DirectoryItem, SearchState } from "../../shared/types";
export interface StableSidebarProps {
  search: SearchState;
  directories: DirectoryItem[];
  aiSearchEnabled: boolean;
  aiSearchBusy: boolean;
  isLoadingDirectories: boolean;
  isAddingDirectory: boolean;
  directoryServiceUnavailable: boolean;
  editingDirectoryId: string | null;
  onAiSearchToggle: () => void;
  onSearchOptionsChange: (search: SearchState) => void;
  onAddDirectory: () => void;
  onEditDirectory: (id: string) => void;
  onCancelDirectoryEdit: () => void;
  onDirectoryNameChange: (id: string, name: string) => void;
  onMoveDirectory: (id: string, direction: "up" | "down") => void;
  onOpenDirectory: (path: string) => void;
  onDeleteDirectory: (id: string) => void;
  onOpenSettings: () => void;
}
