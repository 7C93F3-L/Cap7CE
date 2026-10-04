import { inspectVideoFactBatch } from "./videoFactInspector";
import { createVideoFactService } from "./videoFactService";
import { notifySearchIndexChanged } from "./searchIndexChangeRuntime";
import { listPendingVideoFactCandidates, writeVideoFactBatch } from "./sqliteImageIndex";

export const videoFactService = createVideoFactService({
  listPendingCandidates: listPendingVideoFactCandidates,
  inspectBatch: inspectVideoFactBatch,
  writeBatch: async (records) => {
    const written = await writeVideoFactBatch(records);
    if (written > 0) notifySearchIndexChanged();
    return written;
  }
});

export const enqueueVideoFactsForDirectories = (directoryIds: string[]) => videoFactService.enqueueDirectories(directoryIds);
export const discardVideoFactsForDirectory = (directoryPath: string) => videoFactService.discardDirectory(directoryPath);
export const setVideoFactForegroundActive = (active: boolean) => videoFactService.setForegroundActive(active);
