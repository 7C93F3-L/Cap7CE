import { app, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import {
  deleteImagesByFilePaths,
  findImageRecordFilePaths,
  normalizeImageFilePathKey
} from "./sqliteImageIndex";
import { listDirectories } from "./directoryStore";
import { isSupportedImageFilePath } from "./imageScanner";
import {
  deleteVisualCachesForImages,
  isCap7CECachePath
} from "./visualCacheService";
import { releaseVisualRenderFileHandles } from "./visualRenderService";

interface DeleteFileFailure {
  path: string;
  error: string;
}

export interface DeleteFilesResult {
  success: boolean;
  totalCount: number;
  deletedPaths: string[];
  failedItems: DeleteFileFailure[];
}

const normalizeFilePaths = (filePaths: string[]) => {
  const uniqueFilePaths = new Map<string, string>();

  for (const filePath of Array.isArray(filePaths) ? filePaths : []) {
    if (typeof filePath !== "string" || filePath.trim().length === 0) {
      continue;
    }

    const resolvedPath = path.resolve(filePath);
    const key = normalizeImageFilePathKey(resolvedPath);
    if (!uniqueFilePaths.has(key)) {
      uniqueFilePaths.set(key, resolvedPath);
    }
  }

  return [...uniqueFilePaths.values()];
};

const isPathInsideDirectory = (filePath: string, directoryPath: string) => {
  const relativePath = path.relative(path.resolve(directoryPath), path.resolve(filePath));
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
};

const getTrashFailureMessage = (error: unknown) => {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  const message = error instanceof Error ? error.message : "";
  if (code === "ENOENT") {
    return t("file.sourceMissing");
  }
  if (code === "EACCES" || code === "EPERM") {
    return t("file.trashPermissionDenied");
  }
  if (/operation was aborted/i.test(message)) {
    return t("file.trashOperationAborted");
  }
  return message
    ? t("file.trashFailedWithMessage", { message })
    : t("file.trashFailed");
};

const delay = (milliseconds: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, milliseconds);
});

const trashOperationIntervalMs = 250;
let lastTrashOperationFinishedAt = 0;

const moveFileToTrashOnce = async (filePath: string) => {
  const elapsed = Date.now() - lastTrashOperationFinishedAt;
  if (elapsed < trashOperationIntervalMs) {
    await delay(trashOperationIntervalMs - elapsed);
  }

  try {
    if (!app.isPackaged) {
      console.debug("[file-delete:trash] request", { filePath });
    }
    await shell.trashItem(filePath);
    if (!app.isPackaged) {
      console.debug("[file-delete:trash] success", { filePath });
    }
  } finally {
    lastTrashOperationFinishedAt = Date.now();
  }
};

const moveFileToTrashWithRetry = async (filePath: string) => {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        throw new Error(t("file.sourceNotFile"));
      }
      await moveFileToTrashOnce(filePath);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

export const moveIndexedImagesToTrash = async (
  filePaths: string[]
): Promise<DeleteFilesResult> => {
  const normalizedFilePaths = normalizeFilePaths(filePaths);
  const failedItems: DeleteFileFailure[] = [];
  const allowedFilePaths = normalizedFilePaths.filter((filePath) => {
    if (isCap7CECachePath(filePath)) {
      failedItems.push({
        path: filePath,
        error: t("file.protectedCache")
      });
      return false;
    }
    return true;
  });
  const [recordFilePaths, directories] = await Promise.all([
    findImageRecordFilePaths(allowedFilePaths),
    listDirectories()
  ]);
  const recordPathKeys = new Set(recordFilePaths.map(normalizeImageFilePathKey));
  const deletableFilePaths: string[] = [];

  for (const filePath of allowedFilePaths) {
    const hasImageRecord = recordPathKeys.has(normalizeImageFilePathKey(filePath));
    const isSupportedFileInAddedDirectory = isSupportedImageFilePath(filePath)
      && directories.some((directory) => isPathInsideDirectory(filePath, directory.path));
    if (!hasImageRecord && !isSupportedFileInAddedDirectory) {
      failedItems.push({
        path: filePath,
        error: t("file.outsideAddedDirectories")
      });
      continue;
    }
    deletableFilePaths.push(filePath);
  }

  releaseVisualRenderFileHandles();

  const deletedPaths: string[] = [];
  for (const filePath of deletableFilePaths) {
    try {
      await moveFileToTrashWithRetry(filePath);
      deletedPaths.push(filePath);
    } catch (error) {
      if (!app.isPackaged) {
        console.debug("[file-delete:trash] failed", { filePath, error });
      }
      failedItems.push({
        path: filePath,
        error: getTrashFailureMessage(error)
      });
    }
  }

  if (deletedPaths.length > 0) {
    try {
      await deleteImagesByFilePaths(deletedPaths);
    } catch (error) {
      console.warn("[file-delete] source files were trashed, but index cleanup failed", error);
    }
    try {
      await deleteVisualCachesForImages(deletedPaths);
    } catch (error) {
      console.warn("[file-delete] source files were trashed, but cache cleanup failed", error);
    }
  }

  return {
    success: normalizedFilePaths.length > 0 && failedItems.length === 0 && deletedPaths.length === normalizedFilePaths.length,
    totalCount: normalizedFilePaths.length,
    deletedPaths,
    failedItems
  };
};
import { t } from "./localization";
