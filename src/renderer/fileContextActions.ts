import type { ImageContextMenuAction, ImageContextMenuGroup } from "./ImageContextMenu";

export const fileContextShortcutLabels = {
  primaryView: "Space",
  open: "Enter",
  showInFolder: "Ctrl+Enter",
  copyPaths: "Ctrl+Shift+C",
  addDirectory: "Ctrl+Shift+D",
  addToSidebar: "Ctrl+Shift+B",
  delete: "Delete"
} as const;

export type FileContextShortcutAction =
  | "open"
  | "showInFolder"
  | "copyPaths"
  | "addDirectory"
  | "addToSidebar"
  | "delete";

interface FileContextShortcutEvent {
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

export const getFileContextShortcutAction = (event: FileContextShortcutEvent): FileContextShortcutAction | null => {
  if (event.metaKey || event.altKey) return null;
  if (event.ctrlKey && event.shiftKey && event.code === "KeyC") return "copyPaths";
  if (event.ctrlKey && event.shiftKey && event.code === "KeyD") return "addDirectory";
  if (event.ctrlKey && event.shiftKey && event.code === "KeyB") return "addToSidebar";
  if (event.ctrlKey && !event.shiftKey && event.key === "Enter") return "showInFolder";
  if (!event.ctrlKey && !event.shiftKey && event.key === "Delete") return "delete";
  if (!event.ctrlKey && !event.shiftKey && event.key === "Enter") return "open";
  return null;
};

type FileContextMenuActionInput = Omit<ImageContextMenuAction, "shortcut">;

interface BuildFileContextMenuGroupsOptions {
  actionsLabel: string;
  additionalActions?: ImageContextMenuAction[];
  copyPathsAction: FileContextMenuActionInput;
  deleteAction?: FileContextMenuActionInput;
  editKeywordsAction?: FileContextMenuActionInput;
  editKeywordsShortcut?: string;
  openAction: FileContextMenuActionInput;
  primaryViewAction: FileContextMenuActionInput;
  showInFolderAction: FileContextMenuActionInput;
  viewLabel: string;
}

export const buildFileContextMenuGroups = ({
  actionsLabel,
  additionalActions = [],
  copyPathsAction,
  deleteAction,
  editKeywordsAction,
  editKeywordsShortcut,
  openAction,
  primaryViewAction,
  showInFolderAction,
  viewLabel
}: BuildFileContextMenuGroupsOptions): ImageContextMenuGroup[] => [{
  id: "view",
  label: viewLabel,
  actions: [
    { ...primaryViewAction, shortcut: fileContextShortcutLabels.primaryView },
    { ...openAction, shortcut: fileContextShortcutLabels.open },
    { ...showInFolderAction, shortcut: fileContextShortcutLabels.showInFolder }
  ]
}, {
  id: "actions",
  label: actionsLabel,
  actions: [
    { ...copyPathsAction, shortcut: fileContextShortcutLabels.copyPaths },
    ...additionalActions,
    ...(editKeywordsAction
      ? [{ ...editKeywordsAction, shortcut: editKeywordsShortcut }]
      : []),
    ...(deleteAction
      ? [{ ...deleteAction, shortcut: fileContextShortcutLabels.delete }]
      : [])
  ]
}];
