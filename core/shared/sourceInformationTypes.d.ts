export interface SkimPreviewInfo {
  kind: "file" | "folder";
  name: string;
  path: string;
  extension: string;
  size: number;
  modifiedAt: string;
  withinAddedDirectory: boolean;
}

export interface SkimFolderStats {
  fileCount: number;
  folderCount: number;
  totalSize: number;
  skippedCount: number;
  status: "scanning" | "completed" | "cancelled";
}
export interface FolderStatsOptions { directoryConcurrency?: number; progressIntervalMs?: number; }
export interface FolderStatsSnapshot { sequence: number; done: boolean; stats: SkimFolderStats; }
