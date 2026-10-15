import type { DirectoryItem } from "./types";

// Favorites own shortcuts only. File/scan counts belong to the shared Catalog.
export type FavoriteDirectory = Pick<DirectoryItem, "id" | "name" | "path">;
export interface FavoriteDirectoryRegistry {
  readonly renameJournalPath?: string;
  list(): Promise<FavoriteDirectory[]>;
  add(path: string, name?: string): Promise<FavoriteDirectory[]>;
  rename(id: string, name: string): Promise<FavoriteDirectory[]>;
  remove(id: string): Promise<FavoriteDirectory[]>;
  move(id: string, direction: "up" | "down"): Promise<FavoriteDirectory[]>;
  relocate(change: import("./directoryRenameTypes").DirectoryRename): Promise<FavoriteDirectory[]>;
}
export interface FavoriteDirectoryApi extends Omit<FavoriteDirectoryRegistry, "relocate" | "renameJournalPath"> {
  choose(): Promise<FavoriteDirectory[]>;
  renameFolder(id: string, name: string): Promise<import("./directoryRenameTypes").FavoriteFolderRenameResult>;
}
export interface FavoriteDirectoryControls {
  directories: readonly FavoriteDirectory[];
  busy: boolean;
  add: (path: string) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
}
