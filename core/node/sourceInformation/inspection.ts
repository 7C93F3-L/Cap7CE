import fs from "node:fs/promises";
import path from "node:path";
import type { SkimPreviewInfo } from "../../../src/shared/sourceInformationTypes";
import { isPathWithinDirectory } from "../directoryBrowse/source/sourcePathPolicy";
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
