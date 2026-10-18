import type { ComputerSearchSort } from "./computerSearchFactTypes";
import type { FavoriteDirectory } from "./favoriteDirectoryTypes";

export interface CatalogCommandOperation { run(): Promise<string>; confirmation?: string; }
export interface CatalogCommandPage {
  sort: ComputerSearchSort; showHidden: boolean; includeSubfolders: boolean;
  setSort(value: ComputerSearchSort): Promise<boolean>;
  setHidden(value: boolean): Promise<boolean>;
  setSubfolders(value: boolean): Promise<boolean>;
  home(): void; refresh(): Promise<boolean>; dismissError?: () => void;
}
export interface CatalogCommandFavorites {
  directories: readonly FavoriteDirectory[];
  add(path: string): Promise<boolean>; remove(id: string): Promise<boolean>;
  rename(id: string, name: string): Promise<boolean>; reload(): Promise<boolean>;
}
