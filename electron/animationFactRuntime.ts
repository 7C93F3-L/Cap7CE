import { createAnimationFactService } from "./animationFactService";
import { listPendingAnimationFactCandidates, writeAnimationFactBatch } from "./sqliteImageIndex";
import { notifySearchIndexChanged } from "./searchIndexChangeRuntime";

export const animationFactService = createAnimationFactService({
  listPendingCandidates: listPendingAnimationFactCandidates,
  writeBatch: async (records) => {
    const written = await writeAnimationFactBatch(records);
    if (written > 0) notifySearchIndexChanged();
    return written;
  }
});
export const enqueueAnimationFactsForDirectories = (directoryIds: string[]) => animationFactService.enqueueDirectories(directoryIds);
export const discardAnimationFactsForDirectory = (directoryPath: string) => animationFactService.discardDirectory(directoryPath);
export const setAnimationFactForegroundActive = (active: boolean) => animationFactService.setForegroundActive(active);
