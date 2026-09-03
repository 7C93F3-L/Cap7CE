export type NativeFileContextMenuAction =
  | "preview"
  | "open"
  | "showInFolder"
  | "copyPaths"
  | "editKeywords"
  | "delete"
  | "addDirectory"
  | "addToSidebar";

export interface NativeFileContextMenuItem {
  id: NativeFileContextMenuAction;
  label: string;
  disabled?: boolean;
  separatorBefore?: boolean;
}

export interface NativeFileContextMenuRequest {
  fileName: string;
  summary: string;
  items: NativeFileContextMenuItem[];
}
