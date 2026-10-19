import { app } from "electron";
import type { ComputerSearchItem } from "./computerSearchTypes";
import { getTrashFailureMessage, type DeleteFilesResult } from "./fileOperationService";
import { getVisualCacheDirectories } from "./visualCacheService";
import { releaseVisualRenderFileHandles } from "./visualRenderService";
import { requestCoreTrash } from "./core/coreTrashClient";
import { coreTrashFailureError } from "./core/coreTrashProtocol";
import { t } from "./localization";

export async function moveComputerSearchItemsToTrash(items: readonly ComputerSearchItem[]): Promise<DeleteFilesResult> {
  releaseVisualRenderFileHandles();
  const result = await requestCoreTrash({ packaged: app.isPackaged }, { mode: "catalog", targets: items,
    cacheRoots: getVisualCacheDirectories() }).catch(() => { throw new Error(t("file.trashFailed")); });
  return { ...result, failedItems: result.failedItems.map(item => ({ path: item.path, error: getTrashFailureMessage(coreTrashFailureError(item)) })) };
}
