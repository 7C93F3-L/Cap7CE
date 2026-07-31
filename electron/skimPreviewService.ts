import fs from "node:fs/promises";
import path from "node:path";

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

const normalizePathKey = (value: string) => {
  const normalized = path.normalize(path.resolve(value));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
};

export const isPathWithinDirectory = (candidatePath: string, directoryPath: string) => {
  const candidateKey = normalizePathKey(candidatePath);
  const directoryKey = normalizePathKey(directoryPath);
  const relativePath = path.relative(directoryKey, candidateKey);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
};

export const inspectSkimEntry = async (
  entryPath: string,
  expectedKind: "file" | "folder",
  addedDirectoryPaths: string[]
): Promise<SkimPreviewInfo> => {
  if (!path.isAbsolute(entryPath)) {
    const error = new Error("Invalid skim preview path.") as NodeJS.ErrnoException;
    error.code = "EINVAL";
    throw error;
  }
  const normalizedPath = path.normalize(path.resolve(entryPath));
  const stats = await fs.lstat(normalizedPath);
  const actualKind = stats.isDirectory() ? "folder" : stats.isFile() ? "file" : null;
  if (stats.isSymbolicLink() || actualKind !== expectedKind) {
    const error = new Error("Skim preview target type changed.") as NodeJS.ErrnoException;
    error.code = "EINVAL";
    throw error;
  }
  return {
    kind: actualKind,
    name: path.basename(normalizedPath) || normalizedPath,
    path: normalizedPath,
    extension: actualKind === "file" ? path.extname(normalizedPath).toLowerCase() : "",
    size: actualKind === "file" ? stats.size : 0,
    modifiedAt: stats.mtime.toISOString(),
    withinAddedDirectory: addedDirectoryPaths.some((directoryPath) => isPathWithinDirectory(normalizedPath, directoryPath))
  };
};

const emptyStats = (): SkimFolderStats => ({
  fileCount: 0,
  folderCount: 0,
  totalSize: 0,
  skippedCount: 0,
  status: "scanning"
});

export const collectSkimFolderStats = async (
  rootPath: string,
  shouldCancel: () => boolean,
  onProgress: (stats: SkimFolderStats) => void,
  options: { directoryConcurrency?: number; progressIntervalMs?: number } = {}
): Promise<SkimFolderStats> => {
  const directoryConcurrency = Math.max(1, Math.min(8, options.directoryConcurrency ?? 4));
  const progressIntervalMs = Math.max(0, options.progressIntervalMs ?? 160);
  const pendingDirectories = [path.normalize(path.resolve(rootPath))];
  const stats = emptyStats();
  let lastProgressAt = 0;

  const emitProgress = (force = false) => {
    const now = Date.now();
    if (force || now - lastProgressAt >= progressIntervalMs) {
      lastProgressAt = now;
      onProgress({ ...stats });
    }
  };

  while (pendingDirectories.length > 0 && !shouldCancel()) {
    const batch = pendingDirectories.splice(0, directoryConcurrency);
    const results = await Promise.all(batch.map(async (directoryPath) => {
      try {
        return await fs.readdir(directoryPath, { withFileTypes: true });
      } catch {
        stats.skippedCount += 1;
        return [];
      }
    }));

    for (let batchIndex = 0; batchIndex < batch.length && !shouldCancel(); batchIndex += 1) {
      const directoryPath = batch[batchIndex];
      const entries = results[batchIndex];
      const filePaths: string[] = [];
      for (const entry of entries) {
        if (shouldCancel()) break;
        if (entry.isSymbolicLink()) continue;
        const childPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
          stats.folderCount += 1;
          pendingDirectories.push(childPath);
        } else if (entry.isFile()) {
          filePaths.push(childPath);
        }
      }
      for (let index = 0; index < filePaths.length && !shouldCancel(); index += 16) {
        const fileResults = await Promise.all(filePaths.slice(index, index + 16).map(async (filePath) => {
          try {
            const fileStats = await fs.lstat(filePath);
            return fileStats.isSymbolicLink() || !fileStats.isFile()
              ? { count: 0, size: 0 }
              : { count: 1, size: fileStats.size };
          } catch {
            stats.skippedCount += 1;
            return { count: 0, size: 0 };
          }
        }));
        stats.fileCount += fileResults.reduce((sum, result) => sum + result.count, 0);
        stats.totalSize += fileResults.reduce((sum, result) => sum + result.size, 0);
        emitProgress();
      }
    }
    emitProgress();
  }

  stats.status = shouldCancel() ? "cancelled" : "completed";
  emitProgress(true);
  return { ...stats };
};
