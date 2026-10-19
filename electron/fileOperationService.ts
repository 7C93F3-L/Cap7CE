import { app } from "electron";
import { requestCoreTrash, closeCoreTrashClients } from "./core/coreTrashClient";
import { coreTrashFailureError } from "./core/coreTrashProtocol";
import path from "node:path";
import {
  deleteImagesByFilePaths,
  findCatalogRecordFilePaths,
  findImageRecordFilePaths,
  normalizeImageFilePathKey
} from "./sqliteImageIndex";
import { listDirectories } from "./directoryStore";
import { getFileFormatCapability } from "./formatCapabilities";
import {
  deleteVisualCachesForImages,
  isCap7CECachePath, getVisualCacheDirectories
} from "./visualCacheService";
import { releaseVisualRenderFileHandles } from "./visualRenderService";
app.once("will-quit", closeCoreTrashClients);

import type { DeleteFileFailure, DeleteFilesResult } from "../src/shared/deleteFilesTypes";
export type { DeleteFilesResult } from "../src/shared/deleteFilesTypes";
import { getTrashFailureMessage } from "./trashFailureMessage";
export { getTrashFailureMessage } from "./trashFailureMessage";

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

export const moveFileToTrashWithRetry = async (filePath: string, directory = false) => {
  const result = await requestCoreTrash({ packaged: app.isPackaged }, { mode: "legacy",
    targets: [{ path: filePath, isDirectory: directory }], cacheRoots: getVisualCacheDirectories() });
  if (!result.success) throw coreTrashFailureError(result.failedItems[0]);
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
  const [imageRecordFilePaths, catalogRecordFilePaths, directories] = await Promise.all([
    findImageRecordFilePaths(allowedFilePaths),
    findCatalogRecordFilePaths(allowedFilePaths),
    listDirectories()
  ]);
  const recordPathKeys = new Set(
    [...imageRecordFilePaths, ...catalogRecordFilePaths].map(normalizeImageFilePathKey)
  );
  const deletableFilePaths: string[] = [];

  for (const filePath of allowedFilePaths) {
    const hasIndexedRecord = recordPathKeys.has(normalizeImageFilePathKey(filePath));
    const isSupportedFileInAddedDirectory = Boolean(getFileFormatCapability(path.extname(filePath).toLowerCase())?.canSearch)
      && directories.some((directory) => isPathInsideDirectory(filePath, directory.path));
    if (!hasIndexedRecord && !isSupportedFileInAddedDirectory) {
      failedItems.push({
        path: filePath,
        error: t("file.outsideAddedDirectories")
      });
      continue;
    }
    deletableFilePaths.push(filePath);
  }

  await releaseVisualRenderFileHandles();

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
