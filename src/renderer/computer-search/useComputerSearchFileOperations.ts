import { useCallback, useRef, useState } from "react";
import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";
import type { FavoriteDirectoryControls } from "../../shared/favoriteDirectoryTypes";
import { t } from "../../../electron/localization";
import { normalizeWindowsPathKey } from "../filePath";
import { useTransientFeedback } from "../controllers/useTransientFeedback";
import { reportComputerSearchTrash } from "./useComputerSearchTrashUpdates";
import { useDirectoryMetadataAction } from "../metadata-build/useDirectoryMetadataAction";

export function useComputerSearchFileOperations(taskId: string, favorites?: FavoriteDirectoryControls) {
  const pending = useRef(false), [busy, setBusy] = useState(false);
  const feedback = useTransientFeedback();
  const metadata = useDirectoryMetadataAction();
  const trash = useCallback(async (items: ComputerSearchItem[]) => {
    if (pending.current || !items.length) return false;
    if (items.length > 200) { feedback.show(t("catalogActions.trashLimit")); return false; }
    pending.current = true; setBusy(true);
    try {
      const result = await window.cap7ce?.computerSearch.moveToTrash({ taskId, authorizationIds: items.map(item => item.authorizationId) });
      if (!result) throw new Error("trash-bridge-unavailable");
      if (result.deletedPaths.length) reportComputerSearchTrash(result.deletedPaths);
      if (result.failedItems.length) feedback.show(`${t("delete.failedCount", { count: result.failedItems.length })} ${result.failedItems[0].error}`);
      return result.deletedPaths.length > 0;
    } catch { feedback.show(t("computerSearch.actionFailed")); return false; }
    finally { pending.current = false; setBusy(false); }
  }, [taskId, feedback.show]);
  const favorite = (item: ComputerSearchItem) => item.isDirectory && favorites
    ? favorites.directories.find(directory => normalizeWindowsPathKey(directory.path) === normalizeWindowsPathKey(item.path)) : undefined;
  const toggleFavorite = async (item: ComputerSearchItem) => {
    if (!item.isDirectory || !favorites || favorites.busy) return;
    const current = favorite(item);
    if (!await (current ? favorites.remove(current.id) : favorites.add(item.path))) feedback.show(t("computerSearch.actionFailed"));
  };
  return { trash, toggleFavorite, metadata: metadata.start, busy, feedback: feedback.message || metadata.message,
    favoriteAction: (item: ComputerSearchItem) => item.isDirectory && favorites ? (favorite(item) ? "remove" as const : "add" as const) : undefined };
}
