export interface DirectoryRename { oldPath: string; newPath: string }
export interface FavoriteFolderRenameResult {
  change: DirectoryRename | null;
  directories: import("./favoriteDirectoryTypes").FavoriteDirectory[];
  warning?: string;
}
