import type { DirectoryItem } from "./types";

// Favorites own shortcuts only. File/scan counts belong to the shared Catalog.
export type FavoriteDirectory = Pick<DirectoryItem, "id" | "name" | "path">;
export interface FavoriteDirectoryRegistry {
  list(): Promise<FavoriteDirectory[]>;
  add(path: string, name?: string): Promise<FavoriteDirectory[]>;
  rename(id: string, name: string): Promise<FavoriteDirectory[]>;
  remove(id: string): Promise<FavoriteDirectory[]>;
  move(id: string, direction: "up" | "down"): Promise<FavoriteDirectory[]>;
}
export interface FavoriteDirectoryApi extends FavoriteDirectoryRegistry {
  choose(): Promise<FavoriteDirectory[]>;
}
