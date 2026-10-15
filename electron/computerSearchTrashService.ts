import fs from "node:fs/promises";
import path from "node:path";
import type { ComputerSearchItem } from "./computerSearchTypes";
import { getTrashFailureMessage, moveFileToTrashWithRetry, type DeleteFilesResult } from "./fileOperationService";
import { isCap7CECachePath } from "./visualCacheService";
import { releaseVisualRenderFileHandles } from "./visualRenderService";
import { t } from "./localization";

const key = (value: string) => path.resolve(value).toLowerCase();
const within = (value: string, root: string) => key(value).startsWith(key(root) + path.sep);
export async function moveComputerSearchItemsToTrash(items: readonly ComputerSearchItem[],
  trash = moveFileToTrashWithRetry): Promise<DeleteFilesResult> {
  const targets = [...new Map(items.map(item => [key(item.path), item])).values()]
    .sort((a, b) => a.path.length - b.path.length);
  const deletedPaths: string[] = [], failedItems: DeleteFilesResult["failedItems"] = [];
  const removedFolders: string[] = [];
  releaseVisualRenderFileHandles();
  for (const item of targets) {
    try {
      if (removedFolders.some(folder => within(item.path, folder))) { deletedPaths.push(item.path); continue; }
      if (!path.isAbsolute(item.path) || key(item.path) === key(path.parse(item.path).root) || isCap7CECachePath(item.path))
        throw new Error(t("file.protectedCache"));
      const stat = await fs.lstat(item.path);
      if (stat.isSymbolicLink() || (item.isDirectory ? !stat.isDirectory() : !stat.isFile()))
        throw new Error(t("catalogActions.targetChanged"));
      await trash(item.path, item.isDirectory);
      deletedPaths.push(item.path);
      if (item.isDirectory) removedFolders.push(item.path);
    } catch (error) { failedItems.push({ path: item.path, error: getTrashFailureMessage(error) }); }
  }
  return { success: targets.length > 0 && !failedItems.length, totalCount: targets.length, deletedPaths, failedItems };
}
