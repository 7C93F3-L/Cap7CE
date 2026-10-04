import { inspectThreeDFactBatch } from "./threeDFactInspector";
import { createThreeDFactService } from "./threeDFactService";
import { notifySearchIndexChanged } from "./searchIndexChangeRuntime";
import { listPendingThreeDFactCandidates, writeThreeDFactBatch } from "./sqliteImageIndex";

export const threeDFactService = createThreeDFactService({
  listPendingCandidates: listPendingThreeDFactCandidates,
  inspectBatch: inspectThreeDFactBatch,
  writeBatch: async (records) => {
    const written = await writeThreeDFactBatch(records);
    if (written > 0) notifySearchIndexChanged();
    return written;
  }
});

export const enqueueThreeDFactsForDirectories = (directoryIds: string[]) => threeDFactService.enqueueDirectories(directoryIds);
export const discardThreeDFactsForDirectory = (directoryPath: string) => threeDFactService.discardDirectory(directoryPath);
export const setThreeDFactForegroundActive = (active: boolean) => threeDFactService.setForegroundActive(active);
